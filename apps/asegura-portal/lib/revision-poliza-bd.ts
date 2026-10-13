/**
 * Acceso a `seguros.portal_revision_poliza` (`prisma/sql/2026-10-13_revision_huecos.sql`) por SQL directo:
 * el modelo Prisma aún no está en el schema. TODA consulta lleva `identidad_id` (la de la cookie) DENTRO del
 * `WHERE`; quien llama la resuelve con `lib/session`. Sin la tabla, `leerRevision` devuelve `null`
 * (= no se pudo mirar, la ficha sigue) y `guardarRevision` lanza (ruidoso).
 */
import { prisma } from '@/lib/db'

import { puntosGuardados, type Punto } from './revision-poliza'

/** Lo cacheado para ESTA póliza y ESTA huella. `undefined` = no hay; `null` = no se pudo leer. */
export async function leerRevision(identidadId: string, polizaId: string, huella: string): Promise<Punto[] | undefined | null> {
  try {
    const filas = await prisma.$queryRaw<{ puntos: unknown }[]>`
      SELECT puntos FROM seguros.portal_revision_poliza
       WHERE identidad_id = ${identidadId}::uuid AND poliza_declarada_id = ${polizaId}::uuid AND huella = ${huella}
       LIMIT 1`
    if (filas.length === 0) return undefined
    return puntosGuardados(filas[0].puntos) ?? null
  } catch (e) {
    console.error('[portal/revision] no se pudo leer la caché:', e instanceof Error ? e.message : e)
    return null
  }
}

/** Revisiones generadas por esta identidad en las últimas 24 h (el tope diario). */
export async function revisionesDeHoy(identidadId: string): Promise<number> {
  const filas = await prisma.$queryRaw<{ n: bigint | number }[]>`
    SELECT count(*) AS n FROM seguros.portal_revision_poliza
     WHERE identidad_id = ${identidadId}::uuid AND creada_en > now() - interval '24 hours'`
  return Number(filas[0]?.n ?? 0)
}

export async function guardarRevision(identidadId: string, polizaId: string, huella: string, puntos: Punto[]): Promise<void> {
  await prisma.$executeRaw`
    INSERT INTO seguros.portal_revision_poliza (identidad_id, poliza_declarada_id, huella, puntos)
    VALUES (${identidadId}::uuid, ${polizaId}::uuid, ${huella}, ${JSON.stringify(puntos)}::jsonb)
    ON CONFLICT (poliza_declarada_id, huella) DO NOTHING`
}
