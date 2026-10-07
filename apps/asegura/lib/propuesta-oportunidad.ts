// Cargador con BD de la propuesta de una oportunidad (08/10/2026). Solo SELECT, todo por `correduria_id`.
// El ensamblado (comparador + calidad + recomendación) es PURO y vive en `propuesta-oportunidad-reglas.ts`.
// 🚨 Sin tabla de fichas (SQL 2026-10-07c sin aplicar) NO es «sin fichas»: se degrada a «las coberturas no constan» y se dice.

import { condicionesDeJson, presupuestoDeJson, type FichaComparable } from '@central/module-tarificacion'
import { prisma } from './tenant'
import { esSinTablaFichas } from './tarificador-fichas-reglas'
import { ensamblarPropuesta, type PresupuestoExtraido, type ResultadoPropuesta, type TrabajoParaPropuesta } from './propuesta-oportunidad-reglas'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
/** Trabajos que se miran por oportunidad (los más recientes; de cada compañía sirve el último `ok`). */
const MAX_TRABAJOS = 30

const obj = (v: unknown): Record<string, unknown> | null =>
  typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : null

export type CargaPropuesta =
  | { estado: 'no_encontrada' }
  | { estado: 'cargada'; resultado: ResultadoPropuesta }

/** `OP-` + 8 primeros del id si la oportunidad no tiene referencia propia (`import_ref`). */
export function referenciaOportunidad(importRef: string | null, id: string): string {
  const r = importRef?.trim()
  return r ? r : `OP-${id.slice(0, 8).toUpperCase()}`
}

export async function cargarPropuestaOportunidad(correduriaId: string, oportunidadId: string, ahora: Date = new Date()): Promise<CargaPropuesta> {
  if (!UUID.test(oportunidadId)) return { estado: 'no_encontrada' }
  const [op] = await prisma.$queryRaw<{ tipo: string | null; import_ref: string | null; cliente: string | null; guardado: unknown }[]>`
    select o.tipo::text as tipo, o.import_ref,
           nullif(trim(concat_ws(' ', c.nombre, c.apellidos)), '') as cliente,
           o.info_riesgo->'presupuestosCompanias' as guardado
    from seguros.oportunidades o
    left join seguros.clientes c on c.id = o.cliente_id and c.correduria_id = o.correduria_id
    where o.id = ${oportunidadId}::uuid and o.correduria_id = ${correduriaId}::uuid`
  if (!op) return { estado: 'no_encontrada' }

  const filas = await prisma.$queryRaw<{ id: string; compania: string; estado: string; created_at: Date; tarificacion_id: string | null; respuesta: unknown }[]>`
    select t.id::text as id, t.compania, t.estado, t.created_at, t.tarificacion_id::text as tarificacion_id, x.respuesta
    from seguros.tarificacion_trabajos t
    left join seguros.tarificaciones x on x.id = t.tarificacion_id and x.correduria_id = t.correduria_id
    where t.correduria_id = ${correduriaId}::uuid and t.oportunidad_id = ${oportunidadId}::uuid
    order by t.created_at desc
    limit ${MAX_TRABAJOS}`
  const trabajos: TrabajoParaPropuesta[] = filas.map((f) => ({
    trabajoId: f.id, compania: f.compania, estado: f.estado, creadoEn: f.created_at.toISOString(), tarificacionId: f.tarificacion_id, respuesta: f.respuesta,
  }))

  const ramo = op.tipo ?? 'comunidades'
  const tarificaciones = [...new Set(trabajos.map((t) => t.tarificacionId).filter((x): x is string => x !== null))]
  const avisosCarga: string[] = []

  let presupuestos: PresupuestoExtraido[] = []
  let fichas: FichaComparable[] = []
  try {
    if (tarificaciones.length) {
      const p = await prisma.$queryRaw<{ tarificacion_id: string; valores: unknown }[]>`
        select tarificacion_id::text as tarificacion_id, valores
        from seguros.tarificador_coberturas_presupuesto
        where correduria_id = ${correduriaId}::uuid and tarificacion_id = any(${tarificaciones}::uuid[])`
      presupuestos = p.map((x) => ({ tarificacionId: x.tarificacion_id, valores: presupuestoDeJson(x.valores) }))
    }
    const f = await prisma.$queryRaw<{ id: string; compania: string; ramo: string; producto: string; version: string | null; estado: string; condiciones: unknown }[]>`
      select id::text as id, compania, ramo, producto, version, estado, condiciones
      from seguros.tarificador_fichas
      where correduria_id = ${correduriaId}::uuid and ramo = ${ramo}
      order by updated_at desc
      limit 200`
    fichas = f.map((x) => ({
      id: x.id, compania: x.compania, ramo: x.ramo, producto: x.producto, version: x.version,
      estado: x.estado === 'validada' ? 'validada' : 'pendiente', condiciones: condicionesDeJson(x.condiciones),
    }))
  } catch (e) {
    if (!esSinTablaFichas(e)) throw e
    avisosCarga.push('Las fichas de producto aún no están disponibles: las coberturas de las compañías no constan.')
  }

  const formulario = obj(obj(op.guardado)?.formulario)
  const r = ensamblarPropuesta({
    ramo, cliente: op.cliente, referencia: referenciaOportunidad(op.import_ref, oportunidadId), formulario,
    trabajos, presupuestos, fichas, hoy: ahora.toISOString().slice(0, 10), fecha: ahora,
  })
  if (r.estado === 'ok') {
    r.avisos.push(...avisosCarga)
    r.modelo.avisos.push(...avisosCarga)
  }
  return { estado: 'cargada', resultado: r }
}
