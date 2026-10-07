// «Presupuestos de compañías» de una OPORTUNIDAD (07/10/2026). Decisión de Alberto: la cotización por
// bots se pide desde la oportunidad, con UN formulario de riesgo común; cada compañía recibe su riesgo
// mapeado por su capacidad (`@central/module-tarificacion` · capacidades.ts) y es UN trabajo de la cola
// de siempre (`seguros.tarificacion_trabajos.oportunidad_id`, columna que ya existía: sin SQL nuevo).
//
// El formulario se guarda en `oportunidades.info_riesgo.presupuestosCompanias` (clave nueva; el resto de
// claves se conservan con `||`). 🚨 TARIFICAR ≠ EMITIR. Todo por `correduria_id`.

import { catalogoCotizacion, prepararSolicitud, type RiesgoComunidad } from '@central/module-tarificacion'
import { prisma } from './tenant'
import { encolarTrabajo, lanzarPendientes } from './tarificador'
import { proyectarTrabajo, proyectarUltimoRiesgo, type TrabajoLectura, type UltimoRiesgo } from './tarificador-lectura-reglas'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
/** Tope de trabajos que se devuelven por oportunidad (los más recientes): nada de cientos de filas. */
export const MAX_TRABAJOS_OPORTUNIDAD = 30

export type FormularioGuardado = {
  ramo: string
  formulario: Record<string, unknown>
  /** compañía (clave canónica) → extras tecleados para ella. */
  extras: Record<string, Record<string, unknown>>
  companias: string[]
  actualizadoEn: string | null
  actor: string | null
}

const obj = (v: unknown): Record<string, unknown> | null =>
  typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : null

/** `info_riesgo.presupuestosCompanias` → forma conocida o `null` (sin guardar o con otra forma). PURO. */
export function leerFormularioGuardado(v: unknown): FormularioGuardado | null {
  const o = obj(v)
  const f = obj(o?.formulario)
  if (!o || !f || typeof o.ramo !== 'string') return null
  const extras: Record<string, Record<string, unknown>> = {}
  for (const [k, x] of Object.entries(obj(o.extras) ?? {})) { const e = obj(x); if (e) extras[k] = e }
  return {
    ramo: o.ramo,
    formulario: f,
    extras,
    companias: Array.isArray(o.companias) ? o.companias.filter((c): c is string => typeof c === 'string') : [],
    actualizadoEn: typeof o.actualizadoEn === 'string' ? o.actualizadoEn : null,
    actor: typeof o.actor === 'string' ? o.actor : null,
  }
}

export type TrabajoDeOportunidad = TrabajoLectura & { id: string; compania: string; ramo: string }

export type LecturaPresupuestos = {
  oportunidadId: string
  ramo: string
  /** El formulario guardado en la oportunidad (`null` = aún no se ha pedido nada desde aquí). */
  guardado: FormularioGuardado | null
  /** Sin formulario guardado: el riesgo del último trabajo del CLIENTE (pre-relleno). `riesgo: null` = no hay. */
  previoCliente: UltimoRiesgo | null
  trabajos: TrabajoDeOportunidad[]
}

/** Lectura de la sección. `null` = la oportunidad no existe o no es de esta correduría. Solo SELECT. */
export async function leerPresupuestosOportunidad(correduriaId: string, oportunidadId: string): Promise<LecturaPresupuestos | null> {
  if (!UUID.test(oportunidadId)) return null
  const [op] = await prisma.$queryRaw<{ tipo: string; cliente_id: string | null; guardado: unknown }[]>`
    select o.tipo::text as tipo, o.cliente_id::text as cliente_id, o.info_riesgo->'presupuestosCompanias' as guardado
    from seguros.oportunidades o
    where o.id = ${oportunidadId}::uuid and o.correduria_id = ${correduriaId}::uuid`
  if (!op) return null
  const filas = await prisma.$queryRaw<{ id: string; compania: string; ramo: string; estado: string; created_at: Date; updated_at: Date; error: unknown; respuesta: unknown }[]>`
    select t.id::text as id, t.compania, t.ramo, t.estado, t.created_at, t.updated_at, t.error, x.respuesta
    from seguros.tarificacion_trabajos t
    left join seguros.tarificaciones x on x.id = t.tarificacion_id and x.correduria_id = t.correduria_id
    where t.correduria_id = ${correduriaId}::uuid and t.oportunidad_id = ${oportunidadId}::uuid
    order by t.created_at desc
    limit ${MAX_TRABAJOS_OPORTUNIDAD}`
  const guardado = leerFormularioGuardado(op.guardado)
  let previoCliente: UltimoRiesgo | null = null
  if (!guardado && op.cliente_id) {
    const [u] = await prisma.$queryRaw<{ id: string; created_at: Date; riesgo: unknown }[]>`
      select t.id::text as id, t.created_at, t.riesgo
      from seguros.tarificacion_trabajos t
      where t.correduria_id = ${correduriaId}::uuid and t.cliente_id = ${op.cliente_id}::uuid and t.ramo = ${op.tipo}
      order by t.created_at desc
      limit 1`
    previoCliente = proyectarUltimoRiesgo(u ?? null)
  }
  return {
    oportunidadId,
    ramo: op.tipo,
    guardado,
    previoCliente,
    trabajos: filas.map((f) => ({ id: f.id, compania: f.compania, ramo: f.ramo, ...proyectarTrabajo(f, f.respuesta) })),
  }
}

export type EntradaPedir = {
  correduriaId: string
  oportunidadId: string
  ramo: string
  formulario: unknown
  extras: Record<string, unknown>
  companias: string[]
  solicitadoPor: string
  actor: string
}

export type ResultadoCompania =
  | { compania: string; estado: 'encolado'; trabajoId: string }
  | { compania: string; estado: 'rechazado'; status: number; motivo: string }

export type ResultadoPedir =
  | { ok: true; resultados: ResultadoCompania[] }
  | { ok: false; status: number; motivo: string; errores?: string[] }

/**
 * Valida el formulario con CADA compañía elegida (todo o nada: con un error no se encola ninguna),
 * guarda el formulario en la oportunidad y encola un trabajo por compañía ligado a ella. Lanzar las
 * máquinas es mejor esfuerzo (el barrido reintenta).
 */
export async function pedirPresupuestosOportunidad(e: EntradaPedir): Promise<ResultadoPedir> {
  if (!UUID.test(e.oportunidadId)) return { ok: false, status: 400, motivo: 'oportunidadId no es un uuid' }
  const companias = [...new Set(e.companias.map((c) => c.trim().toLowerCase()).filter(Boolean))]
  if (companias.length === 0) return { ok: false, status: 400, motivo: 'elige al menos una compañía' }
  if (companias.length > 10) return { ok: false, status: 400, motivo: 'demasiadas compañías' }

  const [op] = await prisma.$queryRaw<{ tipo: string }[]>`
    select o.tipo::text as tipo from seguros.oportunidades o
    where o.id = ${e.oportunidadId}::uuid and o.correduria_id = ${e.correduriaId}::uuid`
  if (!op) return { ok: false, status: 404, motivo: 'oportunidad_no_encontrada' }
  if (op.tipo !== e.ramo) return { ok: false, status: 400, motivo: `la oportunidad es de ${op.tipo}, no de ${e.ramo}` }

  const cat = catalogoCotizacion()
  const hoy = new Date()
  const preparadas: { compania: string; riesgo: RiesgoComunidad }[] = []
  const errores: string[] = []
  for (const c of companias) {
    const p = prepararSolicitud(cat, c, e.ramo, e.formulario, e.extras[c] ?? {}, hoy)
    if (p.ok) preparadas.push({ compania: p.compania, riesgo: p.riesgo })
    else errores.push(...p.errores)
  }
  if (errores.length) return { ok: false, status: 400, motivo: 'datos no válidos', errores: [...new Set(errores)] }

  const guardado = {
    ramo: e.ramo,
    formulario: e.formulario,
    extras: Object.fromEntries(companias.map((c) => [c, e.extras[c] ?? {}])),
    companias,
    actualizadoEn: hoy.toISOString(),
    actor: e.actor,
  }
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`
      update seguros.oportunidades
      set info_riesgo = coalesce(info_riesgo, '{}'::jsonb) || jsonb_build_object('presupuestosCompanias', ${JSON.stringify(guardado)}::jsonb)
      where id = ${e.oportunidadId}::uuid and correduria_id = ${e.correduriaId}::uuid`
    await tx.$executeRaw`
      insert into seguros.oportunidad_historial (correduria_id, oportunidad_id, accion, detalle, actor)
      values (${e.correduriaId}::uuid, ${e.oportunidadId}::uuid, 'presupuestos_companias_pedidos',
              ${JSON.stringify({ companias, ramo: e.ramo })}::jsonb, ${e.actor})`
  })

  const resultados: ResultadoCompania[] = []
  for (const p of preparadas) {
    const r = await encolarTrabajo({
      correduriaId: e.correduriaId, oportunidadId: e.oportunidadId, clienteId: null, polizaId: null,
      compania: p.compania, ramo: 'comunidades', riesgo: p.riesgo, solicitadoPor: e.solicitadoPor,
    })
    resultados.push(r.estado === 'encolado'
      ? { compania: p.compania, estado: 'encolado', trabajoId: r.trabajoId }
      : { compania: p.compania, estado: 'rechazado', status: r.status, motivo: r.motivo })
  }
  for (const p of preparadas) {
    if (resultados.some((r) => r.compania === p.compania && r.estado === 'encolado')) {
      await lanzarPendientes(e.correduriaId, p.compania).catch(() => null)
    }
  }
  return { ok: true, resultados }
}
