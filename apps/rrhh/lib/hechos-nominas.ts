/**
 * N3 — OUTBOX de hechos contables de nómina (tabla rrhh.hechos_nominas, migración 0033). Aquí NUNCA hay HTTP: el hecho se inserta en la
 * MISMA transacción que la confirmación de la nómina (si ésta falla, no queda hecho; si confirma, el hecho existe aunque contabilidad
 * esté caída) y lo envía el cron `/api/cron/enviar-hechos-nominas`. Idempotente por (empresa_id, tipo, ref) = `nomina:<id>`.
 * Todo con empresa_id de la sesión.
 */
import { Prisma } from '@prisma/client'
import { prisma } from './prisma'
import type { HechoNominaPuerto, HechoPagoNominaPuerto } from '@central/module-nominas'

/** PrismaPromise para componerla con otras sentencias en `prisma.$transaction([...])`. Repetir la ref no duplica ni sobrescribe. */
export function encolarHechoNomina(empresaId: string, nominaId: string, hecho: HechoNominaPuerto | HechoPagoNominaPuerto) {
  return prisma.$executeRaw(Prisma.sql`
    INSERT INTO rrhh.hechos_nominas (empresa_id, nomina_id, tipo, ref, hecho, estado, intentos)
    VALUES (${empresaId}::uuid, ${nominaId}::uuid, ${hecho.tipo}, ${hecho.ref}, ${JSON.stringify(hecho)}::jsonb, 'pendiente', 0)
    ON CONFLICT (empresa_id, tipo, ref) DO NOTHING`)
}

export type FilaHechoNomina = {
  id: string; empresa_id: string; nomina_id: string; tipo: string; hecho: unknown; intentos: number; contabilidad_empresa_id: string
}

/** Cola pendiente de empresas con `contabilidad_nominas` ACTIVO y empresa de contabilidad vinculada (si se apaga, deja de enviarse). */
export async function leerColaHechosNominas(ahora: Date, limite: number): Promise<FilaHechoNomina[]> {
  return prisma.$queryRaw<FilaHechoNomina[]>(Prisma.sql`
    SELECT h.id::text AS id, h.empresa_id::text AS empresa_id, h.nomina_id::text AS nomina_id, h.tipo, h.hecho, h.intentos,
           m.contabilidad_empresa_id::text AS contabilidad_empresa_id
    FROM rrhh.hechos_nominas h
    JOIN rrhh.empresa_modulos m ON m.empresa_id = h.empresa_id AND m.modulo = 'contabilidad_nominas' AND m.activo = true
    WHERE h.estado IN ('pendiente', 'error') AND m.contabilidad_empresa_id IS NOT NULL
      AND (h.proximo_intento IS NULL OR h.proximo_intento <= ${ahora}::timestamptz)
    ORDER BY h.creado_en ASC
    LIMIT ${limite}`)
}

export async function marcarHechoNomina(
  id: string, empresaId: string, v: { estado: 'enviado' | 'rechazado' | 'error'; detalle: string | null; intentos: number; proximoIntento: Date | null; ahora: Date },
): Promise<void> {
  await prisma.$executeRaw(Prisma.sql`
    UPDATE rrhh.hechos_nominas
    SET estado = ${v.estado}, intentos = ${v.intentos}, ultimo_error = ${v.detalle}, actualizado_en = ${v.ahora}::timestamptz,
        proximo_intento = ${v.proximoIntento}::timestamptz, enviado_en = ${v.estado === 'enviado' ? v.ahora : null}::timestamptz
    WHERE id = ${id}::uuid AND empresa_id = ${empresaId}::uuid`)
}
