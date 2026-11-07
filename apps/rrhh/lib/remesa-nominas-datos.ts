/**
 * Carga de BD para la remesa de nóminas (`lib/remesa-nominas.ts` es la lógica pura). TODA sentencia filtra por la
 * `empresa_id` de la sesión (cepo `lib/aislamiento-nominas.test.ts`; `rrhh_app` tiene BYPASSRLS).
 * `empresas.nif/iban/bic`, `empleados.iban` y `nominas.remesa_generada_at/remesa_msg_id` los añade la migración 0033: SQL crudo.
 * 🚨 Los IBAN que se leen aquí NO se escriben nunca a logs.
 */
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { eurosACentimos, type EmpresaRemesa, type EmpleadoRemesa, type NominaRemesa } from '@/lib/remesa-nominas'

export async function cargarDatosRemesa(empresaId: string, periodo: string): Promise<{
  empresa: EmpresaRemesa | null
  nominas: NominaRemesa[]
  empleados: EmpleadoRemesa[]
}> {
  const empresas = await prisma.$queryRaw<EmpresaRemesa[]>(Prisma.sql`
    SELECT id::text AS id, nombre, nif, iban, bic
    FROM rrhh.empresas WHERE id = ${empresaId}::uuid LIMIT 1`)

  const filas = await prisma.$queryRaw<{
    id: string; empresa_id: string; empleado_id: string; periodo: string; estado: string
    neto: unknown; modo: string | null
  }[]>(Prisma.sql`
    SELECT n.id::text AS id, n.empresa_id::text AS empresa_id, n.empleado_id::text AS empleado_id, n.periodo, n.estado,
           n.datos_calculo->'netoAPagar' AS neto, n.datos_calculo->>'modo' AS modo
    FROM rrhh.nominas n
    WHERE n.empresa_id = ${empresaId}::uuid AND n.periodo = ${periodo}`)

  const empleados = await prisma.$queryRaw<EmpleadoRemesa[]>(Prisma.sql`
    SELECT e.id::text AS id, e.empresa_id::text AS empresa_id, e.nombre, e.apellidos, e.iban
    FROM rrhh.empleados e
    WHERE e.empresa_id = ${empresaId}::uuid
      AND e.id IN (SELECT n.empleado_id FROM rrhh.nominas n WHERE n.empresa_id = ${empresaId}::uuid AND n.periodo = ${periodo})`)

  return {
    empresa: empresas[0] ?? null,
    nominas: filas.map(f => ({
      id: f.id,
      empresa_id: f.empresa_id,
      empleado_id: f.empleado_id,
      periodo: f.periodo,
      estado: f.estado,
      // jsonb numérico llega como number; ausente/null = «no se sabe» (nunca 0).
      liquido_centimos: eurosACentimos(f.neto),
      modo: f.modo,
    })),
    empleados,
  }
}

export type SelloPrevio = { nomina_id: string; remesa_generada_at: string; remesa_msg_id: string | null }

/**
 * Sella la generación de la remesa en cada nómina incluida (contra el doble pago), en UNA transacción con las filas
 * bloqueadas (`FOR UPDATE`): dos descargas a la vez no pasan las dos el control. Si alguna nómina ya tenía remesa
 * generada y no hay `confirmarRepeticion`, NO sella nada y devuelve las previas (la ruta responde 409).
 */
export async function sellarRemesa(p: {
  empresaId: string
  nominaIds: string[]
  idMensaje: string
  confirmarRepeticion: boolean
}): Promise<{ ok: true; previas: SelloPrevio[] } | { ok: false; previas: SelloPrevio[] }> {
  return prisma.$transaction(async (tx) => {
    const filas = await tx.$queryRaw<{ nomina_id: string; remesa_generada_at: string | null; remesa_msg_id: string | null }[]>(Prisma.sql`
      SELECT n.id::text AS nomina_id, n.remesa_generada_at::text AS remesa_generada_at, n.remesa_msg_id
      FROM rrhh.nominas n
      WHERE n.empresa_id = ${p.empresaId}::uuid AND n.id = ANY(${p.nominaIds}::uuid[])
      FOR UPDATE`)
    const previas = filas.filter((f): f is SelloPrevio => f.remesa_generada_at !== null)
    if (previas.length > 0 && !p.confirmarRepeticion) return { ok: false as const, previas }
    await tx.$executeRaw(Prisma.sql`
      UPDATE rrhh.nominas SET remesa_generada_at = now(), remesa_msg_id = ${p.idMensaje}
      WHERE empresa_id = ${p.empresaId}::uuid AND id = ANY(${p.nominaIds}::uuid[])`)
    return { ok: true as const, previas }
  })
}
