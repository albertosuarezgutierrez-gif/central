// PROPUESTA DE ESCENARIOS (07/10/2026): varios presupuestos de la MISMA oportunidad que se le enseñan
// juntos al cliente (otro tomador, otro conductor…). SQL: prisma/sql/2026-10-07e_presupuesto_propuesta.sql.
//
// 🧱 Todo filtrado por `correduria_id`: con BYPASSRLS un id ajeno no falla, devuelve los datos de otro.
// 🧱 Sin copia: el documento lee cada presupuesto (opciones visibles, congeladas) y su petición. La lógica de
//    etiquetas, orden y «la más económica» es PURA y vive en `@central/module-seguros` (propuesta-escenarios.ts).
// 🧱 Crear NO avisa a nadie (borrador). Avisar exige `confirmar: true` (el botón final lo pulsa Alberto) y
//    REUTILIZA las dos fases de `avisarPresupuesto()`: PRIMERO `prepararAviso()` de TODOS los escenarios (solo
//    lee: si uno no puede, no se rota ninguna llave) y DESPUÉS `ejecutarAviso()` (mismo compare-and-swap del token,
//    mismos sellos). Por correo sale UN correo por TOMADOR (`barrera-lote.ts`); por WhatsApp, UN mensaje por
//    tomador con el código de CADA escenario junto a su enlace, y todas las rotaciones en una transacción.
// 🚨 Un TOMADOR por aviso: el portal solo enseña un presupuesto a SU tomador. En el caso del Mercedes (P1 a
//    nombre de Ana, P2 a nombre de Rafael) salen DOS avisos, cada uno con su escenario; el documento (PDF) sí
//    junta los dos.
// 🚨 El DNI de la petición NO cruza el puerto: la vista lleva la etiqueta ya escrita, no las figuras.

import {
  estadoPresupuesto, figurasDePeticion, mensajePropuestaWhatsapp, ordenarEscenarios, seguroAnteriorDePeticion, textoSeguroAnterior,
  correoPropuesta, type EscenarioEntrada,
} from '@central/module-seguros'
import { prismaAsegura } from './asegura-db'
import { crearBarreraLote, type ResultadoCorreoLote } from './barrera-lote'
import { rechazoDeRemitente } from './correo-invitacion-portal'
import { confirmarWhatsapp, ejecutarAviso, prepararAviso, type AvisoPreparado, type CanalAviso, type ParteLote, type ResultadoEnvio } from './envio-presupuesto'
import { coberturasIncluidas } from './presupuesto-pdf'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
/** Mínimo y máximo de escenarios por propuesta (el CHECK de `orden` admite 10). */
export const MIN_ESCENARIOS = 2
export const MAX_ESCENARIOS = 6
/** Estados de presupuesto que pueden entrar en una propuesta: los vigentes y aún sin decidir. */
const VIGENTE = new Set(['borrador', 'enlazado', 'enviado', 'visto'])

export type EscenarioVista = {
  numero: number
  presupuestoId: string
  referencia: string | null
  etiqueta: string
  tomador: { clienteId: string; nombre: string | null }
  estado: string
  venceEl: string
  masEconomica: boolean
  primaMinima: number | null
  seguroAnterior: string
  opciones: Array<{ compania: string; producto: string | null; modalidad: string | null; primaEur: number | null; coberturas: string[] }>
}

export type VistaPropuesta = {
  id: string
  referencia: string
  oportunidadId: string
  creadoAt: string
  creadoPor: string
  canalAviso: CanalAviso | null
  avisadoAt: string | null
  retiradaAt: string | null
  cliente: string
  ramo: string
  escenarios: EscenarioVista[]
}

export type FalloPropuesta =
  | 'datos_invalidos' | 'no_encontrado' | 'sin_tabla' | 'otra_oportunidad' | 'no_vigente' | 'sin_tarificacion' | 'misma_variante'
  | 'retirada' | 'sin_confirmar'

export type ErrorPropuesta = { estado: 'error'; motivo: FalloPropuesta; detalle: string }
const error = (motivo: FalloPropuesta, detalle: string): ErrorPropuesta => ({ estado: 'error', motivo, detalle })

/** La tabla aún no existe (SQL sin aplicar): NO es «no hay propuestas». */
export function esSinTablaPropuesta(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e)
  const meta = (e as { meta?: { code?: string } } | null)?.meta?.code
  return (meta === '42P01' || /42P01|does not exist|no existe/i.test(msg)) && /presupuesto_propuesta/.test(msg)
}
export const MENSAJE_SIN_TABLA_PROPUESTA =
  'Las propuestas de escenarios aún no están activadas: falta aplicar el SQL 2026-10-07e_presupuesto_propuesta.sql en la BD de la correduría.'

const numero = (v: unknown): number | null => {
  if (v === null || v === undefined) return null
  const n = Number(String(v))
  return Number.isFinite(n) ? n : null
}

// ─── Crear (borrador) ────────────────────────────────────────────────────────

export async function crearPropuesta(
  correduriaId: string,
  e: { oportunidadId: string; presupuestoIds: unknown; actor: string },
  ahora: Date = new Date(),
): Promise<{ estado: 'ok'; id: string; referencia: string } | ErrorPropuesta> {
  const ids = Array.isArray(e.presupuestoIds) ? e.presupuestoIds.filter((x): x is string => typeof x === 'string' && UUID.test(x)) : []
  if (!UUID.test(e.oportunidadId) || ids.length !== (Array.isArray(e.presupuestoIds) ? e.presupuestoIds.length : -1) || new Set(ids).size !== ids.length) {
    return error('datos_invalidos', 'La oportunidad y los presupuestos tienen que ser ids válidos y sin repetir.')
  }
  if (ids.length < MIN_ESCENARIOS || ids.length > MAX_ESCENARIOS) {
    return error('datos_invalidos', `Una propuesta junta entre ${MIN_ESCENARIOS} y ${MAX_ESCENARIOS} presupuestos.`)
  }
  const db = prismaAsegura()
  return db.$transaction(async (tx) => {
    const filas = await tx.$queryRaw<Array<{
      id: string; tarificacion_id: string | null; t_oportunidad: string | null; venc: Date
      enlace_generado_at: Date | null; enviado_at: Date | null; visto_at: Date | null; elegido_at: Date | null
      aceptado_at: Date | null; emitido_at: Date | null; retirado_at: Date | null
    }>>`
      select pr.id::text as id, pr.tarificacion_id::text as tarificacion_id, t.oportunidad_id::text as t_oportunidad, pr.vence_el as venc,
             pr.enlace_generado_at, pr.enviado_at, pr.visto_at, pr.elegido_at, pr.aceptado_at, pr.emitido_at, pr.retirado_at
      from presupuesto pr
      left join tarificaciones t on t.id = pr.tarificacion_id and t.correduria_id = pr.correduria_id
      where pr.correduria_id = ${correduriaId}::uuid and pr.id = any(${ids}::uuid[])`
    if (filas.length !== ids.length) return error('no_encontrado', 'Algún presupuesto no existe en esta correduría.')
    for (const f of filas) {
      // Solo presupuestos con tarificación: las figuras del escenario salen de SU petición.
      if (!f.tarificacion_id) return error('sin_tarificacion', 'Un presupuesto de ofertas de compañía no tiene intervinientes que comparar: no entra en una propuesta de escenarios.')
      if (f.t_oportunidad !== e.oportunidadId) return error('otra_oportunidad', 'Todos los presupuestos tienen que ser de ESTA oportunidad.')
      const est = estadoPresupuesto({
        venceEl: f.venc, enlaceGeneradoAt: f.enlace_generado_at, enviadoAt: f.enviado_at, vistoAt: f.visto_at,
        elegidoAt: f.elegido_at, aceptadoAt: f.aceptado_at, emitidoAt: f.emitido_at, retiradoAt: f.retirado_at,
      }, ahora)
      if (!VIGENTE.has(est)) return error('no_vigente', `Un presupuesto está ${est}: solo entran los vigentes y sin decidir.`)
    }
    if (new Set(filas.map((f) => f.tarificacion_id)).size !== filas.length) {
      return error('misma_variante', 'Dos presupuestos son de la misma variante: serían el mismo escenario dos veces.')
    }
    const [p] = await tx.$queryRaw<Array<{ id: string; referencia: string }>>`
      insert into presupuesto_propuesta (correduria_id, oportunidad_id, creado_por)
      values (${correduriaId}::uuid, ${e.oportunidadId}::uuid, ${e.actor})
      returning id::text as id, referencia`
    if (!p) throw new Error('presupuesto_propuesta: el insert no devolvió fila')
    for (const [i, id] of ids.entries()) {
      await tx.$executeRaw`
        insert into presupuesto_propuesta_item (propuesta_id, presupuesto_id, correduria_id, orden)
        values (${p.id}::uuid, ${id}::uuid, ${correduriaId}::uuid, ${i + 1})`
      await tx.$executeRaw`
        insert into presupuesto_evento (presupuesto_id, tipo, origen, detalle)
        values (${id}::uuid, 'en_propuesta', 'corredor', ${JSON.stringify({ actor: e.actor, propuestaId: p.id, referencia: p.referencia })}::jsonb)`
    }
    return { estado: 'ok' as const, id: p.id, referencia: p.referencia }
  })
}

// ─── Leer (el documento y la vista) ──────────────────────────────────────────

/** `null` = no existe en esta correduría. Un fallo de consulta LANZA (no es «no existe»). */
export async function leerPropuesta(correduriaId: string, id: string, ahora: Date = new Date()): Promise<VistaPropuesta | null> {
  if (!UUID.test(id)) return null
  const db = prismaAsegura()
  const [cab] = await db.$queryRaw<Array<{
    id: string; referencia: string; oportunidad_id: string; creado_at: Date; creado_por: string; canal_aviso: string | null
    avisado_at: Date | null; retirada_at: Date | null; tipo: string | null; cliente: string | null
  }>>`
    select p.id::text as id, p.referencia, p.oportunidad_id::text as oportunidad_id, p.creado_at, p.creado_por, p.canal_aviso,
           p.avisado_at, p.retirada_at, o.tipo::text as tipo, nullif(trim(concat_ws(' ', c.nombre, c.apellidos)), '') as cliente
    from presupuesto_propuesta p
    join oportunidades o on o.id = p.oportunidad_id and o.correduria_id = p.correduria_id
    left join clientes c on c.id = o.cliente_id and c.correduria_id = o.correduria_id
    where p.id = ${id}::uuid and p.correduria_id = ${correduriaId}::uuid`
  if (!cab) return null

  const items = await db.$queryRaw<Array<{
    id: string; referencia: string | null; cliente_id: string; ramo: string; peticion: unknown; tomador: string | null
    venc: Date; enlace_generado_at: Date | null; enviado_at: Date | null; visto_at: Date | null; elegido_at: Date | null
    aceptado_at: Date | null; emitido_at: Date | null; retirado_at: Date | null
  }>>`
    select pr.id::text as id, pr.referencia, pr.cliente_id::text as cliente_id, pr.ramo, t.peticion,
           nullif(trim(concat_ws(' ', c.nombre, c.apellidos)), '') as tomador, pr.vence_el as venc,
           pr.enlace_generado_at, pr.enviado_at, pr.visto_at, pr.elegido_at, pr.aceptado_at, pr.emitido_at, pr.retirado_at
    from presupuesto_propuesta_item i
    join presupuesto pr on pr.id = i.presupuesto_id and pr.correduria_id = i.correduria_id
    left join tarificaciones t on t.id = pr.tarificacion_id and t.correduria_id = pr.correduria_id
    left join clientes c on c.id = pr.cliente_id and c.correduria_id = pr.correduria_id
    where i.propuesta_id = ${id}::uuid and i.correduria_id = ${correduriaId}::uuid
    order by i.orden`
  const ids = items.map((x) => x.id)
  const opciones = ids.length
    ? await db.$queryRaw<Array<{ presupuesto_id: string; compania: string; producto: string | null; modalidad: string | null; prima: string | null; coberturas: unknown }>>`
        select presupuesto_id::text as presupuesto_id, compania, producto, modalidad, prima_eur::text as prima, coberturas
        from presupuesto_opcion
        where presupuesto_id = any(${ids}::uuid[]) and oculta_at is null
        order by presupuesto_id, orden`
    : []
  const anteriores = items.map((x) => seguroAnteriorDePeticion(x.peticion))
  const codigos = [...new Set(anteriores.flatMap((s) => (s.estado === 'declarado' && s.companiaCodigo ? [s.companiaCodigo] : [])))]
  const nombresCia = new Map<string, string>()
  if (codigos.length) {
    // Directorio GLOBAL de compañías (sin correduría): solo traduce un código DGS a su nombre.
    const filas = await db.$queryRaw<Array<{ codigo_dgs: string; nombre_comun: string | null }>>`
      select codigo_dgs, nombre_comun from companias_dgs where codigo_dgs = any(${codigos}::text[])`
    for (const f of filas) if (f.nombre_comun?.trim()) nombresCia.set(f.codigo_dgs, f.nombre_comun.trim())
  }

  const entrada: EscenarioEntrada[] = items.map((x, i) => ({
    presupuestoId: x.id,
    referencia: x.referencia,
    ramo: x.ramo,
    figuras: figurasDePeticion(x.peticion),
    seguroAnterior: anteriores[i]!,
    opciones: opciones.filter((o) => o.presupuesto_id === x.id).map((o) => ({
      compania: o.compania, producto: o.producto, modalidad: o.modalidad, primaEur: numero(o.prima), coberturas: coberturasIncluidas(o.coberturas),
    })),
  }))
  const porId = new Map(items.map((x) => [x.id, x]))
  const escenarios: EscenarioVista[] = ordenarEscenarios(entrada).map((e) => {
    const x = porId.get(e.presupuestoId)!
    const s = e.seguroAnterior
    return {
      numero: e.numero,
      presupuestoId: e.presupuestoId,
      referencia: e.referencia,
      etiqueta: e.etiqueta,
      tomador: { clienteId: x.cliente_id, nombre: x.tomador },
      estado: estadoPresupuesto({
        venceEl: x.venc, enlaceGeneradoAt: x.enlace_generado_at, enviadoAt: x.enviado_at, vistoAt: x.visto_at,
        elegidoAt: x.elegido_at, aceptadoAt: x.aceptado_at, emitidoAt: x.emitido_at, retiradoAt: x.retirado_at,
      }, ahora),
      venceEl: x.venc.toISOString(),
      masEconomica: e.masEconomica,
      primaMinima: e.primaMinima,
      seguroAnterior: textoSeguroAnterior(s, s.estado === 'declarado' && s.companiaCodigo ? nombresCia.get(s.companiaCodigo) ?? null : null),
      opciones: e.opciones.map((o) => ({ compania: o.compania, producto: o.producto, modalidad: o.modalidad, primaEur: o.primaEur, coberturas: [...o.coberturas] })),
    }
  })
  return {
    id: cab.id,
    referencia: cab.referencia,
    oportunidadId: cab.oportunidad_id,
    creadoAt: cab.creado_at.toISOString(),
    creadoPor: cab.creado_por,
    canalAviso: cab.canal_aviso === 'email' || cab.canal_aviso === 'whatsapp_enlace' ? cab.canal_aviso : null,
    avisadoAt: cab.avisado_at ? cab.avisado_at.toISOString() : null,
    retiradaAt: cab.retirada_at ? cab.retirada_at.toISOString() : null,
    cliente: cab.cliente ?? 'Cliente',
    ramo: cab.tipo ?? items[0]?.ramo ?? 'auto',
    escenarios,
  }
}

/** Las propuestas de una oportunidad (las 10 más recientes). `[]` = de verdad no hay ninguna. */
export async function listarPropuestas(correduriaId: string, oportunidadId: string, ahora: Date = new Date()): Promise<VistaPropuesta[]> {
  if (!UUID.test(oportunidadId)) return []
  const filas = await prismaAsegura().$queryRaw<Array<{ id: string }>>`
    select id::text as id from presupuesto_propuesta
    where correduria_id = ${correduriaId}::uuid and oportunidad_id = ${oportunidadId}::uuid
    order by creado_at desc limit 10`
  const out: VistaPropuesta[] = []
  for (const f of filas) {
    const v = await leerPropuesta(correduriaId, f.id, ahora)
    if (v) out.push(v)
  }
  return out
}

export async function retirarPropuesta(correduriaId: string, e: { id: string; actor: string }): Promise<{ estado: 'ok' } | ErrorPropuesta> {
  if (!UUID.test(e.id)) return error('datos_invalidos', 'id no válido')
  const n = await prismaAsegura().$executeRaw`
    update presupuesto_propuesta set retirada_at = now()
    where id = ${e.id}::uuid and correduria_id = ${correduriaId}::uuid and retirada_at is null`
  return n > 0 ? { estado: 'ok' } : error('no_encontrado', 'No existe en esta correduría o ya estaba retirada.')
}

// ─── Avisar (lo pulsa Alberto) ───────────────────────────────────────────────

/** El resultado de cada presupuesto, tal cual lo dio `avisarPresupuesto` (o `confirmarWhatsapp`). */
export type ResultadoItem = { presupuestoId: string; numero: number; resultado: ResultadoEnvio }
/** Un aviso por TOMADOR (identidad = su ficha). */
export type GrupoAviso = {
  clienteId: string
  nombre: string | null
  numeros: number[]
  /** Correo: `enviado` / error. WhatsApp: el mensaje y el `wa.me` para que Alberto lo mande desde su móvil. */
  estado: 'enviado' | 'enlace' | 'error'
  detalle: string
  whatsapp?: string
  mensaje?: string
}
export type ResultadoAvisoPropuesta = { estado: 'ok' | 'parcial' | 'error'; grupos: GrupoAviso[]; items: ResultadoItem[] }

/** Agrupa los escenarios por TOMADOR (su ficha), conservando el orden del documento. PURA. */
export function gruposPorTomador<T extends { numero: number; tomador: { clienteId: string; nombre: string | null } }>(es: readonly T[]): Array<{ clienteId: string; nombre: string | null; escenarios: T[] }> {
  const out: Array<{ clienteId: string; nombre: string | null; escenarios: T[] }> = []
  for (const e of [...es].sort((a, b) => a.numero - b.numero)) {
    const g = out.find((x) => x.clienteId === e.tomador.clienteId)
    if (g) g.escenarios.push(e)
    else out.push({ clienteId: e.tomador.clienteId, nombre: e.tomador.nombre, escenarios: [e] })
  }
  return out
}

function textoError(r: ResultadoEnvio): string {
  return r.estado === 'error' ? r.detalle : ''
}

export async function avisarPropuesta(
  correduriaId: string,
  e: { id: string; canal: CanalAviso; actor: string; confirmar: unknown },
  ahora: Date = new Date(),
): Promise<ResultadoAvisoPropuesta | ErrorPropuesta> {
  // El botón final lo pulsa Alberto: sin `confirmar: true` explícito no se toca nada.
  if (e.confirmar !== true) return error('sin_confirmar', 'Falta la confirmación explícita del envío. No ha salido nada.')
  const v = await leerPropuesta(correduriaId, e.id, ahora)
  if (!v) return error('no_encontrado', 'Esa propuesta no existe en esta correduría.')
  if (v.retiradaAt) return error('retirada', 'Esta propuesta está retirada: prepara otra.')

  // ── Fase 1: VALIDAR TODO, sin escribir nada. Cada escenario de cada tomador pasa sus guardas
  // (`prepararAviso`: solo lee). Si uno solo no puede, no se rota ninguna llave de ningún escenario.
  const tomadores = gruposPorTomador(v.escenarios)
  const preparados: Array<{ g: (typeof tomadores)[number]; numeros: number[]; preps: Array<{ x: EscenarioVista; prep: AvisoPreparado | ResultadoEnvio }> }> = []
  for (const g of tomadores) {
    const preps: Array<{ x: EscenarioVista; prep: AvisoPreparado | ResultadoEnvio }> = []
    for (const x of g.escenarios) preps.push({ x, prep: await prepararAviso(correduriaId, { id: x.presupuestoId, canal: e.canal, actor: e.actor }, ahora) })
    preparados.push({ g, numeros: g.escenarios.map((x) => x.numero), preps })
  }
  const hayFallo = preparados.some((t) => t.preps.some((y) => y.prep.estado !== 'preparado'))
  if (hayFallo) {
    const intacto = 'No ha salido nada y no se ha tocado ningún escenario: el enlace que ya tuviera sigue abriendo.'
    const grupos: GrupoAviso[] = preparados.map(({ g, numeros, preps }) => {
      const f = preps.find((y) => y.prep.estado !== 'preparado')
      return {
        clienteId: g.clienteId, nombre: g.nombre, numeros, estado: 'error',
        detalle: f ? `Escenario ${f.x.numero}: ${textoError(f.prep as ResultadoEnvio)} ${intacto}` : `Otro escenario de la propuesta no se puede avisar. ${intacto}`,
      }
    })
    const items: ResultadoItem[] = preparados.flatMap(({ preps }) => preps.map(({ x, prep }) => ({
      presupuestoId: x.presupuestoId, numero: x.numero,
      resultado: prep.estado === 'preparado'
        ? { estado: 'error' as const, motivo: 'lote_cancelado' as const, detalle: `Otro escenario de la propuesta no se puede avisar. ${intacto}` }
        : prep as ResultadoEnvio,
    })))
    return { estado: 'error', grupos, items }
  }

  // ── Fase 2: escribir.
  const grupos: GrupoAviso[] = []
  const items: ResultadoItem[] = []
  const listos = preparados.map((t) => ({ ...t, preps: t.preps.map((y) => ({ x: y.x, prep: y.prep as AvisoPreparado })) }))
  if (e.canal === 'email') {
    for (const t of listos) {
      const r = await avisarGrupoPorCorreo(correduriaId, v, t.preps)
      items.push(...r.items)
      grupos.push({ clienteId: t.g.clienteId, nombre: t.g.nombre, numeros: t.numeros, ...r.grupo })
    }
  } else {
    // WhatsApp: no sale nada por red, así que TODAS las rotaciones van en UNA transacción: un compare-and-swap
    // perdido (otro clic a la vez) la deshace entera y no queda ningún escenario con la llave cambiada.
    const r = await rotarWhatsappLote(listos.flatMap((t) => t.preps))
    if (r.estado === 'error') {
      for (const t of listos) {
        grupos.push({ clienteId: t.g.clienteId, nombre: t.g.nombre, numeros: t.numeros, estado: 'error', detalle: r.detalle })
        for (const { x } of t.preps) {
          items.push({ presupuestoId: x.presupuestoId, numero: x.numero, resultado: { estado: 'error', motivo: x.presupuestoId === r.presupuestoId ? 'ocupado' : 'lote_cancelado', detalle: r.detalle } })
        }
      }
    } else {
      for (const t of listos) {
        const res = t.preps.map(({ x }) => ({ presupuestoId: x.presupuestoId, numero: x.numero, resultado: r.porPresupuesto.get(x.presupuestoId)! }))
        items.push(...res)
        const enl = res.map((y) => ({ numero: y.numero, ...(y.resultado as Extract<ResultadoEnvio, { estado: 'enlace' }>) }))
        // Mismo tomador = misma ficha: el correo que se le nombra (o ninguno) es el mismo en todos.
        const mensaje = mensajePropuestaWhatsapp({
          nombre: t.g.nombre, referencia: v.referencia, total: v.escenarios.length, email: enl[0]!.email,
          enlaces: enl.map((x) => ({ numero: x.numero, enlace: x.enlace, codigo: x.codigo })),
          venceEl: new Date(Math.min(...enl.map((x) => new Date(x.venceEl).getTime()))),
        })
        grupos.push({ clienteId: t.g.clienteId, nombre: t.g.nombre, numeros: t.numeros, estado: 'enlace', detalle: 'Ábrelo y mándalo desde tu móvil; luego pulsa «Ya lo he mandado».', mensaje, whatsapp: `https://wa.me/?text=${encodeURIComponent(mensaje)}` })
      }
    }
  }

  const bien = grupos.filter((g) => g.estado !== 'error').length
  if (bien > 0) {
    await prismaAsegura().$executeRaw`
      update presupuesto_propuesta set canal_aviso = ${e.canal}, avisado_at = ${ahora}
      where id = ${v.id}::uuid and correduria_id = ${correduriaId}::uuid`
  }
  return { estado: bien === grupos.length ? 'ok' : bien === 0 ? 'error' : 'parcial', grupos, items }
}

class RotacionPerdida extends Error {
  constructor(readonly presupuestoId: string, readonly detalle: string) { super(detalle) }
}

/** Rota y sella el enlace de TODOS los escenarios del WhatsApp en una sola transacción: o todos, o ninguno. */
async function rotarWhatsappLote(
  preps: Array<{ x: EscenarioVista; prep: AvisoPreparado }>,
): Promise<{ estado: 'ok'; porPresupuesto: Map<string, ResultadoEnvio> } | { estado: 'error'; presupuestoId: string; detalle: string }> {
  try {
    const porPresupuesto = await prismaAsegura().$transaction(async (tx) => {
      const m = new Map<string, ResultadoEnvio>()
      for (const { x, prep } of preps) {
        const r = await ejecutarAviso(prep, null, tx)
        if (r.estado !== 'enlace') throw new RotacionPerdida(x.presupuestoId, `Escenario ${x.numero}: ${textoError(r)} No se ha tocado ningún escenario.`)
        m.set(x.presupuestoId, r)
      }
      return m
    })
    return { estado: 'ok', porPresupuesto }
  } catch (err) {
    if (err instanceof RotacionPerdida) return { estado: 'error', presupuestoId: err.presupuestoId, detalle: err.detalle }
    throw err
  }
}

/**
 * UN correo para los escenarios de UN tomador, ya VALIDADOS todos (`prepararAviso`). Cada uno rota su llave y
 * se une a la barrera donde mandaría su correo; sale uno solo y cada uno sella (o devuelve su llave) con su
 * código de siempre. Si un compare-and-swap se pierde (otro clic a la vez), no sale ninguno y los demás
 * devuelven su llave.
 */
async function avisarGrupoPorCorreo(
  correduriaId: string, v: VistaPropuesta, preps: Array<{ x: EscenarioVista; prep: AvisoPreparado }>,
): Promise<{ items: ResultadoItem[]; grupo: Pick<GrupoAviso, 'estado' | 'detalle'> }> {
  const numeroDe = new Map(preps.map(({ x }) => [x.presupuestoId, x.numero]))
  let motivo: string | null = null
  const barrera = crearBarreraLote<ParteLote>(preps.length, async (partes) => {
    const destinos = new Set(partes.map((p) => p.email.toLowerCase()))
    if (destinos.size !== 1) { motivo = 'Los escenarios de este tomador no van al mismo correo.'; return 'cancelado' }
    const primero = partes[0]!
    const c = correoPropuesta({
      nombre: primero.nombre, referencia: v.referencia, total: v.escenarios.length, email: primero.email,
      enlaces: partes.map((p) => ({ numero: numeroDe.get(p.presupuestoId) ?? 0, enlace: p.enlace })).sort((a, b) => a.numero - b.numero),
      venceEl: new Date(Math.min(...partes.map((p) => p.venceEl.getTime()))),
    })
    return mandarCorreoLote(correduriaId, primero.clienteId, primero.email, c)
  })
  const resultados = await Promise.all(preps.map(async ({ x, prep }): Promise<ResultadoItem> => {
    try {
      const r = await ejecutarAviso(prep, barrera)
      // Se paró ANTES de unirse (compare-and-swap perdido): el lote de este tomador no sale.
      if (r.estado === 'error') barrera.abortar()
      return { presupuestoId: x.presupuestoId, numero: x.numero, resultado: r }
    } catch (err) {
      barrera.abortar()
      throw err
    }
  }))
  const fallo = resultados.find((r) => r.resultado.estado === 'error' && r.resultado.motivo !== 'lote_cancelado')
    ?? resultados.find((r) => r.resultado.estado === 'error')
  if (fallo) {
    return { items: resultados, grupo: { estado: 'error', detalle: `Escenario ${fallo.numero}: ${motivo ?? textoError(fallo.resultado)} No ha salido ningún correo a este tomador.` } }
  }
  return { items: resultados, grupo: { estado: 'enviado', detalle: 'Correo enviado con sus escenarios.' } }
}

async function mandarCorreoLote(correduriaId: string, clienteId: string, destino: string, c: { asunto: string; texto: string; html: string }): Promise<ResultadoCorreoLote> {
  // Import dinámico, como el resto de correos de asegura (los cepos con `node --test` no resuelven core-email).
  const { enviarCorreoSeguido } = await import('./correo-envio')
  const r = await enviarCorreoSeguido({ correduriaId, clienteId, tipo: 'presupuesto_propuesta_aviso', to: destino, asunto: c.asunto, texto: c.texto, html: c.html })
  if (r.resultado === 'enviado') return 'enviado'
  if (r.resultado === 'sin_proveedor') return 'sin_proveedor'
  console.error('[asegura/propuesta] fallo enviando el aviso del lote:', r.motivo)
  return rechazoDeRemitente(r.motivo ?? '') ? 'remitente_no_verificado' : 'rechazado'
}

/** Alberto dice que los WhatsApp del lote ya salieron: cada presupuesto se confirma IGUAL que uno suelto. */
export async function confirmarWhatsappPropuesta(
  correduriaId: string, e: { id: string; actor: string }, ahora: Date = new Date(),
): Promise<{ estado: 'ok' | 'parcial' | 'error'; items: ResultadoItem[] } | ErrorPropuesta> {
  const v = await leerPropuesta(correduriaId, e.id, ahora)
  if (!v) return error('no_encontrado', 'Esa propuesta no existe en esta correduría.')
  if (v.canalAviso !== 'whatsapp_enlace') return error('no_vigente', 'Esta propuesta no se avisó por WhatsApp: no hay nada que confirmar.')
  const items: ResultadoItem[] = []
  for (const x of v.escenarios) {
    if (x.estado !== 'enlazado') continue
    items.push({ presupuestoId: x.presupuestoId, numero: x.numero, resultado: await confirmarWhatsapp(correduriaId, { id: x.presupuestoId, actor: e.actor }, ahora) })
  }
  const bien = items.filter((i) => i.resultado.estado !== 'error').length
  return { estado: items.length > 0 && bien === items.length ? 'ok' : bien === 0 ? 'error' : 'parcial', items }
}
