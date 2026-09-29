// Lectura de BD para `garantias-filtradas.ts`: la actividad del filtro de los últimos 90 días.
import { prismaAsegura } from './asegura-db'
import { TIPO_ACTIVIDAD } from './presupuesto-actividad'
import { DIAS_GARANTIAS_FILTRADAS, agregarGarantiasFiltradas, type GarantiasFiltradas } from './garantias-filtradas'

export async function garantiasFiltradas(correduriaId: string, ahora = new Date()): Promise<GarantiasFiltradas> {
  const db = prismaAsegura()
  const desde = new Date(ahora.getTime() - DIAS_GARANTIAS_FILTRADAS * 86_400_000)
  const presupuestos = await db.$queryRaw<{ id: string; ramo: string }[]>`
    select p.id::text as id, p.ramo
    from presupuesto p
    where p.correduria_id = ${correduriaId}::uuid
      and exists (select 1 from presupuesto_evento e
                  where e.presupuesto_id = p.id and e.tipo = ${TIPO_ACTIVIDAD} and e.ocurrido_at >= ${desde})
  `
  if (presupuestos.length === 0) return agregarGarantiasFiltradas([], new Map())
  const eventos = await db.presupuestoEvento.findMany({
    where: { presupuestoId: { in: presupuestos.map((p) => p.id) }, tipo: TIPO_ACTIVIDAD, ocurridoAt: { gte: desde } },
    select: { presupuestoId: true, detalle: true },
  })
  return agregarGarantiasFiltradas(eventos, new Map(presupuestos.map((p) => [p.id, p.ramo])))
}
