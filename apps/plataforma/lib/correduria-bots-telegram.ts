// BOTS DEL TARIFICADOR por texto libre en Telegram (15/10/2026) — la parte con BD y RED. Lo puro (y con test) está en
// `correduria-bots-tg.ts`; el bucle de IA es el del asistente de la correduría (`manejarCorreduriaTg`, «modo bots»).
//
// Herramientas (lo que la IA puede pedir): proponer un precio por bot, proponer la respuesta a un atasco, leer estado y
// atascos. Las dos primeras SOLO guardan una propuesta (`correduria_bots_propuesta`, SQL 2026-10-15) y mandan un botón
// `tbot_ok:<uuid>`; lo que se hace al pulsar lo decide `resolverBotonBots`, que relee la propuesta de la BD (un solo uso,
// 15 min), revalida contra asegura y llama a los MISMOS puertos que la pantalla (`encolar`, `oportunidad`, `atascos/[id]`).
// Actor en asegura: `agente:telegram-<id>` (quien pulsó). Nunca emite, nunca reintenta: un fallo de red tras pedir es
// «incierta» («míralo en la ficha»), jamás «no se ha hecho».
import { randomUUID } from 'node:crypto'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'
import { tgSendButtons, escapeHtml } from '@central/core-telegram'
import { buscarAsegura } from '@/lib/correduria-puerto'
import { fichaAsegura } from '@/lib/ficha-asegura'
import { interpretarOportunidadesCliente, oportunidadesClienteAsegura, riesgoAsegura } from '@/lib/seguimiento-asegura'
import { interpretarRiesgo, type Riesgo } from '@/lib/riesgo-asegura'
import { leerIntegracionesTarificador, leerPresupuestosOportunidad } from '@/lib/tarificador-asegura'
import { leerIntegraciones, leerTrabajo, resumenTrabajo, rotuloCompania } from '@/lib/tarificador-probar'
import { completarRiesgoVehiculoDesdeFicha, leerEncoladoBot, mensajeFaltanDeFicha } from '@/lib/tarificador-moto-formulario'
import { adaptadorDeRamo } from '@/lib/tarificador-bots-ramos'
import { formularioBotsAutoDeRiesgo, tomadorDeRiesgoBots } from '@/lib/tarificador-auto-riesgo'
import { actorTelegram, aplicarBotonAtasco, leerAtascosAsegura, lineaCandidato, lineaTrasAtasco, puertoRobustez, type Atasco } from '@/lib/tarificador-atascos-asegura'
import {
  atascoSigueIgual, candidatasBots, casarCandidatoAtasco, companiasParaRamo, esUuid, etiquetaOportunidad, etiquetaParaIA, leerPropuesta,
  MAX_CANDIDATOS_BOTS, MINUTOS_PROPUESTA_BOTS, PREFIJO_BOTS_TG, rotuloCandidato,
  type CuerpoAtasco, type CuerpoTarificar, type DecisionBotonBots, type OportunidadBots, type RamoBotsTg, type UsoBots,
} from './correduria-bots-tg'

export const APP_BOTS = 'correduria-bots'

type Salida = { texto: string; ok: boolean }
type Boton = { texto: string; callback: string }

// ── Tope (ventana móvil de 24 h sobre `ai_usos`) ──────────────────────────────────────────────────

/** Llamadas a la IA y € del modo bots en las últimas 24 h. `null` = no se pudo contar (el llamante NO llama a la IA). */
export async function usoBots24h(): Promise<UsoBots | null> {
  const r = await prisma.$queryRaw<{ n: bigint; c: number | null }[]>(Prisma.sql`
    SELECT count(*)::bigint AS n, COALESCE(sum(coste_eur), 0)::float AS c FROM ai_usos
    WHERE app = ${APP_BOTS} AND creada_at > now() - interval '24 hours'`).catch(() => null)
  if (!r || !r[0]) return null
  return { llamadas: Number(r[0].n), eur: Number(r[0].c ?? 0) }
}

// ── Lecturas ─────────────────────────────────────────────────────────────────────────────────────

async function integraciones(): Promise<{ compania: string; ramo: string }[] | string> {
  const r = await leerIntegracionesTarificador().catch(() => ({ status: 502, json: null }))
  const l = leerIntegraciones(r.status, r.json)
  return l.ok ? l.integraciones : l.mensaje
}

async function leerRiesgo(oportunidadId: string): Promise<Riesgo | string> {
  const l = await riesgoAsegura(oportunidadId).then((x) => interpretarRiesgo(x.status, x.json)).catch(() => null)
  if (!l || l.estado === 'error') return `no he podido leer la oportunidad${l ? ` (${l.motivo})` : ''}`
  if (l.estado === 'no_encontrado') return 'esa oportunidad no existe'
  return l.riesgo
}

const deRiesgo = (r: Riesgo): OportunidadBots => ({
  id: r.oportunidad.id, clienteId: r.oportunidad.clienteId, clienteNombre: r.oportunidad.clienteNombre, ramo: r.oportunidad.ramo,
  estado: r.oportunidad.estado, vehiculo: r.oportunidad.vehiculo, matricula: r.oportunidad.matricula, aseguradora: r.oportunidad.aseguradora,
})

/**
 * Oportunidades que casan con lo que dijo Alberto: por id, o buscando en el CRM (el buscador de siempre) y mirando las
 * oportunidades de hasta 5 clientes. `string` = no se pudo leer (nunca «no hay»).
 */
async function localizar(args: Record<string, unknown>): Promise<{ ops: OportunidadBots[]; incompleto: boolean } | string> {
  if (args.oportunidadId !== undefined && args.oportunidadId !== null && args.oportunidadId !== '') {
    if (!esUuid(args.oportunidadId)) return 'oportunidadId no es un id interno: pasa buscar con el nombre o la matrícula'
    const r = await leerRiesgo(String(args.oportunidadId).trim())
    return typeof r === 'string' ? r : { ops: candidatasBots([deRiesgo(r)], null), incompleto: false }
  }
  const q = typeof args.buscar === 'string' ? args.buscar.trim().slice(0, 120) : ''
  if (q.length < 3) return 'dime el nombre del cliente o la matrícula (mínimo 3 letras)'
  const b = await buscarAsegura(q)
  if (b.estado !== 'ok') return `no he podido buscar en el CRM (${b.estado}${'motivo' in b ? `: ${b.motivo}` : ''})`
  const clientes = new Map<string, string>()
  for (const bl of b.bloques) for (const h of bl.hallazgos) if (!clientes.has(h.clienteId)) clientes.set(h.clienteId, h.nombre)
  let incompleto = clientes.size > 5
  const ops: OportunidadBots[] = []
  for (const [clienteId, nombre] of [...clientes].slice(0, 5)) {
    const r = await oportunidadesClienteAsegura(clienteId).catch(() => ({ status: 502, json: null }))
    const l = interpretarOportunidadesCliente(r.status, r.json)
    if (l.estado !== 'ok') { incompleto = true; continue }
    if (l.truncado) incompleto = true
    for (const o of l.oportunidades) {
      ops.push({ id: o.id, clienteId, clienteNombre: nombre, ramo: o.ramo, estado: o.estado, vehiculo: o.vehiculo, matricula: o.matricula, aseguradora: o.aseguradora })
    }
  }
  return { ops: candidatasBots(ops, typeof args.pista === 'string' ? args.pista : null), incompleto }
}

// ── (a) precio por bot: preparar (al proponer y otra vez al confirmar) ─────────────────────────────

type Preparado = { ok: true; envios: { compania: string; cuerpo: Record<string, unknown>; ruta: 'encolar' | 'oportunidad' }[] } | { ok: false; motivo: string }

/**
 * El riesgo que se mandará, sacado en SERVIDOR: coche → del riesgo de la oportunidad con el adaptador de «Bots (gratis)» (lo que
 * la ficha tenga que completar, de la ficha); comunidades → el formulario ya guardado en la oportunidad. Nunca de la IA.
 */
async function preparar(c: CuerpoTarificar): Promise<Preparado> {
  if (c.ramo === 'comunidades') {
    const r = await leerPresupuestosOportunidad(c.oportunidadId).catch(() => ({ status: 502, json: null }))
    const o = (r.json ?? {}) as Record<string, unknown>
    if (r.status !== 200 || o.estado !== 'ok') return { ok: false, motivo: `no he podido leer la oportunidad (HTTP ${r.status})` }
    const g = (o.guardado ?? null) as Record<string, unknown> | null
    if (!g || typeof g.formulario !== 'object' || g.formulario === null) return { ok: false, motivo: 'esta comunidad aún no tiene formulario guardado: la primera vez se pide desde la oportunidad' }
    const extras = (typeof g.extras === 'object' && g.extras !== null ? g.extras : {}) as Record<string, unknown>
    return { ok: true, envios: [{ compania: c.companias.join(','), ruta: 'oportunidad', cuerpo: { oportunidadId: c.oportunidadId, ramo: 'comunidades', formulario: g.formulario, extras, companias: c.companias } }] }
  }
  const riesgo = await leerRiesgo(c.oportunidadId)
  if (typeof riesgo === 'string') return { ok: false, motivo: riesgo }
  if (riesgo.oportunidad.ramo !== 'auto') return { ok: false, motivo: `la oportunidad es de ${riesgo.oportunidad.ramo}, no de coche` }
  const adaptador = adaptadorDeRamo('auto')
  if (!adaptador) return { ok: false, motivo: 'no hay bots de coche' }
  const hecho = adaptador.construir(formularioBotsAutoDeRiesgo(riesgo), {})
  // `faltan` son NOMBRES de campos (nunca valores): se pueden decir.
  if (!hecho.ok) return { ok: false, motivo: `al riesgo le falta: ${hecho.faltan.join(', ')} (complétalo en la oportunidad)` }
  const clienteId = tomadorDeRiesgoBots(riesgo)
  let datos = hecho.riesgo
  if (hecho.completarDesdeFicha.length) {
    const f = await fichaAsegura(clienteId).catch(() => null)
    if (f?.estado !== 'ok') return { ok: false, motivo: 'no he podido leer la ficha del tomador para completar el riesgo' }
    const cc = completarRiesgoVehiculoDesdeFicha('auto', datos, f.ficha, hecho.completarDesdeFicha)
    if (cc.faltan.length) return { ok: false, motivo: mensajeFaltanDeFicha(cc.faltan, 'auto') }
    datos = cc.riesgo
  }
  return { ok: true, envios: c.companias.map((compania) => ({ compania, ruta: 'encolar' as const, cuerpo: { clienteId, oportunidadId: c.oportunidadId, compania, ramo: 'auto', riesgo: datos } })) }
}

async function guardarPropuestas(turnoId: number | null, filas: { tipo: 'tarificar' | 'atasco'; cuerpo: CuerpoTarificar | CuerpoAtasco }[]): Promise<string[] | null> {
  const grupo = randomUUID()
  const ids: string[] = []
  try {
    for (const f of filas) {
      const [r] = await prisma.$queryRaw<{ id: string }[]>(Prisma.sql`
        INSERT INTO correduria_bots_propuesta (grupo, turno_id, tipo, cuerpo, caduca_at)
        VALUES (${grupo}::uuid, ${turnoId}, ${f.tipo}, ${JSON.stringify(f.cuerpo)}::jsonb, now() + make_interval(mins => ${MINUTOS_PROPUESTA_BOTS}::int))
        RETURNING id::text AS id`)
      if (!r) return null
      ids.push(r.id)
    }
    return ids
  } catch {
    return null
  }
}

const SIN_TABLA = 'NO SE PUEDE: no he podido guardar la propuesta (¿falta aplicar el SQL 2026-10-15 de correduria_bots_propuesta?). No se ha lanzado nada.'

async function proponerTarificar(args: Record<string, unknown>, turnoId: number | null): Promise<Salida> {
  const loc = await localizar(args)
  if (typeof loc === 'string') return { texto: `ERROR: ${loc}. NO digas que no existe.`, ok: false }
  if (!loc.ops.length) return { texto: `No encuentro ninguna oportunidad ABIERTA de coche o comunidad que case${loc.incompleto ? ' (la búsqueda quedó incompleta: puede haber más)' : ''}. Pregúntale a Alberto el nombre o la matrícula exactos; la moto se lanza desde su cotizador.`, ok: true }
  if (loc.ops.length > MAX_CANDIDATOS_BOTS) return { texto: `Hay ${loc.ops.length} oportunidades que casan: pídele a Alberto la matrícula o la marca para acotar.`, ok: true }
  const ints = await integraciones()
  if (typeof ints === 'string') return { texto: `ERROR: no he podido comprobar qué compañías tienen bot (${ints}). No se ha lanzado nada.`, ok: false }

  const validas: { op: OportunidadBots; cuerpo: CuerpoTarificar }[] = []
  const descartes: string[] = []
  for (const op of loc.ops) {
    const cs = companiasParaRamo(args.companias, ints, op.ramo ?? '')
    if (!cs.ok) { descartes.push(`${etiquetaParaIA(op)}: ${cs.motivo}`); continue }
    const cuerpo: CuerpoTarificar = { oportunidadId: op.id, ramo: op.ramo as RamoBotsTg, companias: cs.companias }
    const p = await preparar(cuerpo)
    if (!p.ok) { descartes.push(`${etiquetaParaIA(op)}: ${p.motivo}`); continue }
    validas.push({ op, cuerpo })
  }
  if (!validas.length) return { texto: `NO SE PUEDE lanzar: ${descartes.join(' · ')}. Díselo a Alberto tal cual.`, ok: true }
  const ids = await guardarPropuestas(turnoId, validas.map((v) => ({ tipo: 'tarificar' as const, cuerpo: v.cuerpo })))
  if (!ids) return { texto: SIN_TABLA, ok: false }
  const companias = (c: CuerpoTarificar) => c.companias.map(rotuloCompania).join(', ')
  let texto: string
  const botones: Boton[][] = []
  if (validas.length === 1) {
    const v = validas[0]!
    texto = `🤖 <b>Precio por bot</b> (gratis, solo precio, no emite)\n${escapeHtml(etiquetaOportunidad(v.op))}\nCompañías: ${escapeHtml(companias(v.cuerpo))}\n¿Lo lanzo? Caduca en ${MINUTOS_PROPUESTA_BOTS} min.`
    botones.push([{ texto: '✅ Lanzar', callback: `${PREFIJO_BOTS_TG}_ok:${ids[0]}` }, { texto: '❌ No', callback: `${PREFIJO_BOTS_TG}_no:${ids[0]}` }])
  } else {
    texto = `🤖 <b>Precio por bot</b>: hay ${validas.length} oportunidades que casan. Pulsa la buena para lanzarla (gratis, solo precio):`
    validas.forEach((v, i) => botones.push([{ texto: `${etiquetaOportunidad(v.op)} → ${companias(v.cuerpo)}`.slice(0, 60), callback: `${PREFIJO_BOTS_TG}_ok:${ids[i]}` }]))
    botones.push([{ texto: '❌ Ninguna', callback: `${PREFIJO_BOTS_TG}_no:${ids[0]}` }])
  }
  if (descartes.length) texto += `\n\nNo se ofrecen: ${escapeHtml(descartes.join(' · '))}`
  const enviado = await tgSendButtons(texto, botones).catch(() => null)
  if (enviado === null) return { texto: 'NO SE PUEDE: no he podido mandarle el botón a Alberto. No se ha lanzado nada.', ok: false }
  return { texto: `PROPUESTO: Alberto tiene ${validas.length === 1 ? 'el botón' : `${validas.length} botones para elegir`} (${validas.map((v) => etiquetaParaIA(v.op)).join('; ')}). NO está lanzado hasta que pulse.${descartes.length ? ` Descartadas: ${descartes.join(' · ')}` : ''}`, ok: true }
}

// ── (b) atascos ──────────────────────────────────────────────────────────────────────────────────

const ataParaIA = (a: Atasco) => ({
  atascoId: a.id, compania: a.compania, ramo: a.ramo, tipo: a.tipo, busca: a.etiqueta ?? a.textoEsperado ?? a.descripcion,
  candidatos: a.candidatos.map((c) => lineaCandidato(c)),
})

async function atascosParaIA(): Promise<Salida> {
  const l = await leerAtascosAsegura(false)
  if (l.estado !== 'ok') return { texto: `ERROR: no he podido leer los atascos (${l.estado === 'error' ? l.causa : l.estado}). NO digas que no hay.`, ok: false }
  return { texto: JSON.stringify({ atascos: l.atascos.map(ataParaIA), pausas: l.pausas.map((p) => ({ compania: p.compania, ramo: p.ramo, motivo: p.motivo })), ilegibles: l.ilegibles }).slice(0, 7000), ok: true }
}

async function proponerAtasco(args: Record<string, unknown>, turnoId: number | null): Promise<Salida> {
  const l = await leerAtascosAsegura(false)
  if (l.estado !== 'ok') return { texto: `ERROR: no he podido leer los atascos (${l.estado === 'error' ? l.causa : l.estado}). No se ha elegido nada.`, ok: false }
  let a: Atasco | undefined
  if (esUuid(args.atascoId)) a = l.atascos.find((x) => x.id === String(args.atascoId).trim().toLowerCase())
  else if (l.atascos.length === 1) a = l.atascos[0]
  if (!a) {
    if (!l.atascos.length) return { texto: `No hay ningún bot atascado esperando respuesta${l.ilegibles ? ` (hay ${l.ilegibles} que no he podido leer: míralos en /correduria/tarificador)` : ''}.`, ok: true }
    return { texto: `Hay ${l.atascos.length} atascos: pregúntale a Alberto cuál y vuelve a llamar con su atascoId. ${JSON.stringify(l.atascos.map(ataParaIA)).slice(0, 5000)}`, ok: true }
  }
  const m = casarCandidatoAtasco(a.candidatos, args.campo, args.n)
  if (m.tipo === 'ninguno') return { texto: `NO SE PUEDE: ${m.motivo}. Candidatos: ${a.candidatos.map(lineaCandidato).join(' | ')}. Pregúntale a Alberto cuál (o que pulse el número en el aviso del atasco).`, ok: true }
  const ns = m.tipo === 'uno' ? [m.n] : m.ns
  const elegidos = ns.map((n) => a!.candidatos.find((c) => c.n === n)!).filter(Boolean)
  const ids = await guardarPropuestas(turnoId, elegidos.map((c) => ({ tipo: 'atasco' as const, cuerpo: { atascoId: a!.id, n: c.n, rotulo: rotuloCandidato(c) } })))
  if (!ids) return { texto: SIN_TABLA, ok: false }
  const cab = `🧩 <b>Atasco</b> ${escapeHtml(rotuloCompania(a.compania))} · ${escapeHtml(a.ramo || 'ramo')}: busca «${escapeHtml(a.etiqueta ?? a.textoEsperado ?? a.descripcion)}».`
  const botones: Boton[][] = elegidos.map((c, i) => [{ texto: `✅ Elegir ${lineaCandidato(c)}`.slice(0, 60), callback: `${PREFIJO_BOTS_TG}_ok:${ids[i]}` }])
  botones.push([{ texto: '❌ No', callback: `${PREFIJO_BOTS_TG}_no:${ids[0]}` }])
  const texto = elegidos.length === 1
    ? `${cab}\n¿Elijo el ${escapeHtml(lineaCandidato(elegidos[0]!))}? Queda aprendido y el bot repite el presupuesto (solo precio). Caduca en ${MINUTOS_PROPUESTA_BOTS} min.`
    : `${cab}\nVarios candidatos casan; pulsa el bueno (queda aprendido; solo precio):`
  const enviado = await tgSendButtons(texto, botones).catch(() => null)
  if (enviado === null) return { texto: 'NO SE PUEDE: no he podido mandarle el botón a Alberto. No se ha elegido nada.', ok: false }
  return { texto: `PROPUESTO: Alberto tiene ${elegidos.length === 1 ? 'el botón' : `${elegidos.length} botones`} para el atasco de ${a.compania}. NO está elegido hasta que pulse.`, ok: true }
}

// ── (c) estado ───────────────────────────────────────────────────────────────────────────────────

async function estado(args: Record<string, unknown>): Promise<Salida> {
  const loc = await localizar(args)
  if (typeof loc === 'string') return { texto: `ERROR: ${loc}. NO digas que no hay precios.`, ok: false }
  if (!loc.ops.length) return { texto: `No encuentro ninguna oportunidad abierta de coche o comunidad que case${loc.incompleto ? ' (búsqueda incompleta)' : ''}.`, ok: true }
  const salida: Record<string, unknown>[] = []
  for (const op of loc.ops.slice(0, 4)) {
    const r = await leerPresupuestosOportunidad(op.id).catch(() => ({ status: 502, json: null }))
    const o = (r.json ?? {}) as Record<string, unknown>
    if (r.status !== 200 || o.estado !== 'ok' || !Array.isArray(o.trabajos)) { salida.push({ oportunidad: etiquetaParaIA(op), bots: `no se pudo leer (HTTP ${r.status})` }); continue }
    const trabajos = (o.trabajos as unknown[]).slice(0, 10).map((t) => {
      const x = (t ?? {}) as Record<string, unknown>
      const l = leerTrabajo(200, t)
      if (!l.ok) return { compania: x.compania ?? null, estado: 'ilegible' }
      const s = resumenTrabajo(l.trabajo)
      return { compania: typeof x.compania === 'string' ? rotuloCompania(x.compania) : null, cuando: x.actualizadoEn ?? x.creadoEn ?? null, estado: s.titulo, motivo: s.motivo, ofertas: s.ofertas }
    })
    salida.push({ oportunidad: etiquetaParaIA(op), bots: trabajos.length ? trabajos : 'aún no se ha pedido precio por bot' })
  }
  if (loc.ops.length > 4) salida.push({ nota: `hay ${loc.ops.length - 4} oportunidades más; acota con la matrícula o la marca` })
  return { texto: JSON.stringify(salida).slice(0, 7000), ok: true }
}

/** Herramientas del modo bots. Nombre desconocido → error (la IA solo tiene estas). */
export async function ejecutarBots(nombre: string, args: Record<string, unknown> | null, turnoId: number | null): Promise<Salida> {
  if (args === null) return { texto: 'ERROR: argumentos ilegibles. Repite la llamada con JSON válido.', ok: false }
  switch (nombre) {
    case 'bots_tarificar': return proponerTarificar(args, turnoId)
    case 'bots_estado': return estado(args)
    case 'bots_atascos': return atascosParaIA()
    case 'bots_atasco_responder': return proponerAtasco(args, turnoId)
    default: return { texto: `ERROR: la herramienta ${nombre} no existe aquí. Solo: bots_tarificar, bots_estado, bots_atascos, bots_atasco_responder.`, ok: false }
  }
}

// ── Pulsación del botón ──────────────────────────────────────────────────────────────────────────

async function cerrar(id: string, estadoFinal: 'hecha' | 'rechazada' | 'incierta', resultado: unknown): Promise<void> {
  await prisma.$executeRaw(Prisma.sql`
    UPDATE correduria_bots_propuesta SET estado = ${estadoFinal}, resultado = ${JSON.stringify(resultado ?? null)}::jsonb
    WHERE id = ${id}::uuid AND estado = 'aplicando'`).catch(() => {})
}

/**
 * `tbot_ok` / `tbot_no`. Devuelve la línea que sustituye a los botones. Un solo uso: la fila pasa de `propuesta` a `aplicando`
 * en un UPDATE condicionado (dos pulsaciones = una gana) y las hermanas del grupo se descartan. Nada de lo que se hace sale
 * del botón: solo el id.
 */
export async function resolverBotonBots(d: Extract<DecisionBotonBots, { ok: true }>): Promise<string> {
  if (d.accion === 'no') {
    const n = await prisma.$executeRaw(Prisma.sql`
      UPDATE correduria_bots_propuesta SET estado = 'descartada', decidida_at = now(), decidida_por = ${d.quien}
      WHERE grupo = (SELECT grupo FROM correduria_bots_propuesta WHERE id = ${d.id}::uuid) AND estado = 'propuesta'`).catch(() => null)
    return n === null ? '⚠️ <i>No he podido descartarlo; caduca solo.</i>' : '❌ <i>Descartado: no se ha lanzado nada.</i>'
  }
  const filas = await prisma.$queryRaw<{ tipo: string; cuerpo: unknown; grupo: string }[]>(Prisma.sql`
    UPDATE correduria_bots_propuesta SET estado = 'aplicando', decidida_at = now(), decidida_por = ${d.quien}
    WHERE id = ${d.id}::uuid AND estado = 'propuesta' AND caduca_at > now()
    RETURNING tipo, cuerpo, grupo::text AS grupo`).catch(() => null)
  if (filas === null) return '⚠️ <i>No he podido leer la propuesta: no se ha hecho nada.</i>'
  const f = filas[0]
  if (!f) return '<i>Ese botón ya se usó o ha caducado: no se ha hecho nada. Pídemelo otra vez.</i>'
  await prisma.$executeRaw(Prisma.sql`
    UPDATE correduria_bots_propuesta SET estado = 'descartada', decidida_at = now()
    WHERE grupo = ${f.grupo}::uuid AND id <> ${d.id}::uuid AND estado = 'propuesta'`).catch(() => {})
  const p = leerPropuesta(f.tipo, f.cuerpo)
  if (!p) { await cerrar(d.id, 'rechazada', { motivo: 'propuesta_ilegible' }); return '⚠️ <i>La propuesta guardada no se entiende: no se ha hecho nada.</i>' }
  const actor = actorTelegram(d.quien)

  if (p.tipo === 'atasco') {
    const l = await leerAtascosAsegura(false)
    const a = l.estado === 'ok' ? l.atascos.find((x) => x.id === p.cuerpo.atascoId) ?? null : null
    if (l.estado !== 'ok') { await cerrar(d.id, 'rechazada', { motivo: 'lectura' }); return '⚠️ <i>No he podido leer el atasco: no se ha elegido nada.</i>' }
    if (!atascoSigueIgual(a?.candidatos ?? null, p.cuerpo)) { await cerrar(d.id, 'rechazada', { motivo: 'atasco_cambiado' }); return '<i>El atasco ya no está esperando o su lista cambió: no se ha elegido nada.</i>' }
    // El MISMO camino que el botón `atq_e` del aviso del atasco: asegura valida el número contra su lista y la pista.
    const dec = { ok: true as const, tipo: 'elegir' as const, atascoId: p.cuerpo.atascoId, n: p.cuerpo.n, quien: d.quien }
    const r = await aplicarBotonAtasco(dec).catch(() => ({ status: 502, json: { motivo: 'red' } }))
    const ok = r.status === 200
    await cerrar(d.id, ok ? 'hecha' : r.status === 502 ? 'incierta' : 'rechazada', { status: r.status })
    return r.status === 502 ? '⚠️ <i>No sé si se ha elegido (fallo de red): míralo en /correduria/tarificador antes de repetir.</i>' : lineaTrasAtasco(dec, r)
  }

  const prep = await preparar(p.cuerpo)
  if (!prep.ok) { await cerrar(d.id, 'rechazada', { motivo: 'preparar' }); return `⚠️ <i>No se ha lanzado: ${escapeHtml(prep.motivo)}</i>` }
  const lineas: string[] = []
  let incierta = false
  let alguno = false
  for (const e of prep.envios) {
    const r = await puertoRobustez(e.ruta, { method: 'POST', body: JSON.stringify(e.cuerpo) }, actor, 50_000)
    if (r.status === 502) { incierta = true; lineas.push(`${escapeHtml(e.compania)}: ⚠️ no sé si se ha encolado (red); míralo en la oportunidad`); continue }
    if (e.ruta === 'oportunidad') {
      const o = (r.json ?? {}) as Record<string, unknown>
      const res = Array.isArray(o.resultados) ? (o.resultados as Record<string, unknown>[]) : null
      if (r.status !== 202 || !res) { lineas.push(`⚠️ ${escapeHtml(String(o.mensaje ?? `HTTP ${r.status}`))}`); continue }
      for (const x of res) {
        const ok = x.estado === 'encolado'
        alguno ||= ok
        lineas.push(`${escapeHtml(rotuloCompania(String(x.compania ?? '')))}: ${ok ? (x.duplicado === true ? 'ya estaba en cola' : 'en cola') : `no (${escapeHtml(String(x.motivo ?? ''))})`}`)
      }
      continue
    }
    const l = leerEncoladoBot(r.status, r.json)
    alguno ||= l.ok
    lineas.push(`${escapeHtml(rotuloCompania(e.compania))}: ${l.ok ? (l.duplicado ? 'ya estaba en cola' : 'en cola') : escapeHtml(l.mensaje)}`)
  }
  await cerrar(d.id, incierta ? 'incierta' : alguno ? 'hecha' : 'rechazada', { lineas: lineas.length })
  return `${alguno ? '✅' : '⚠️'} <i>Precio por bot (solo precio):</i>\n${lineas.join('\n')}\n<i>El precio sale en la oportunidad; si el bot se atasca, te llega el aviso del atasco.</i>`
}

/** Limpieza: propuestas viejas fuera (no guardan datos personales, pero no hacen falta). */
export async function limpiarPropuestasBots(): Promise<void> {
  await prisma.$executeRaw(Prisma.sql`DELETE FROM correduria_bots_propuesta WHERE creada_at < now() - interval '30 days'`).catch(() => {})
}

