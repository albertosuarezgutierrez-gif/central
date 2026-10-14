/**
 * Acceso a `seguros.portal_revision_poliza` (`prisma/sql/2026-10-13_revision_huecos.sql`) con Prisma TIPADO.
 * 🔒 La identidad NO la pasa quien llama: cada función la resuelve de la COOKIE (`lib/session`, patrón
 * `…DeSesion()`) y va DENTRO del `where`. Sin sesión: lectura `null`, recuento lanza, guardado lanza.
 * Sin la tabla, `leerRevisionDeSesion` devuelve `null` (= no se pudo mirar, la ficha sigue) y
 * `guardarRevisionDeSesion` lanza (ruidoso).
 */
import { prisma } from '@/lib/db'
import { getIdentidad } from '@/lib/session'

import { puntosGuardados, type Punto } from './revision-poliza'

/** Lo cacheado para ESTA póliza y ESTA huella. `undefined` = no hay; `null` = no se pudo leer (o sin sesión). */
export async function leerRevisionDeSesion(polizaId: string, huella: string): Promise<Punto[] | undefined | null> {
  try {
    const identidad = await getIdentidad()
    if (!identidad) return null
    const fila = await prisma.portalRevisionPoliza.findFirst({
      where: { identidadId: identidad.id, polizaDeclaradaId: polizaId, huella },
      select: { puntos: true },
    })
    if (!fila) return undefined
    return puntosGuardados(fila.puntos) ?? null
  } catch (e) {
    console.error('[portal/revision] no se pudo leer la caché:', e instanceof Error ? e.message : e)
    return null
  }
}

async function identidadIdDeSesion(): Promise<string> {
  const identidad = await getIdentidad()
  if (!identidad) throw new Error('revision-poliza-bd: sin sesión')
  return identidad.id
}

/** Revisiones generadas por la identidad de la sesión en las últimas 24 h (el tope diario). */
export async function revisionesDeHoyDeSesion(ahora: Date = new Date()): Promise<number> {
  const identidadId = await identidadIdDeSesion()
  return prisma.portalRevisionPoliza.count({
    where: { identidadId, creadaEn: { gt: new Date(ahora.getTime() - 24 * 60 * 60 * 1000) } },
  })
}

/** Guarda la revisión de la identidad de la sesión. Repetida (misma póliza + huella) = no hace nada. */
export async function guardarRevisionDeSesion(polizaId: string, huella: string, puntos: Punto[]): Promise<void> {
  const identidadId = await identidadIdDeSesion()
  await prisma.portalRevisionPoliza.createMany({
    data: [{ identidadId, polizaDeclaradaId: polizaId, huella, puntos }],
    skipDuplicates: true,
  })
}
