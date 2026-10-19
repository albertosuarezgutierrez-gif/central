// lib/correo/lead-correduria-tarificar.ts — F3a: «🧮 Listo para tarificar» de un lead, PRIMERO con los BOTS (gratis)
// (19/10/2026, spec lead → propuesta §F3 y §3.3; decisión de Alberto: bots antes que Avant2 para no gastar 0,50€).
// PURO: sin red, sin BD, sin env (lo usan el triaje y el webhook; test al lado).
//
//   · Al completarse los datos (F2), asegura REVISA gratis qué compañías con bot activo llegarían a precio. Telegram enseña
//     cuáles se lanzarían, qué se supone y «Hoy: N/20 tarificaciones con bots», con 🤖 `clp_tar:<p>` · ✏️ `clp_edt:<p>` ·
//     ⏸ `clp_no:<p>`. NADA se lanza sin pulsar 🤖 (F3a).
//   · Si a los bots les falta un dato que el cliente puede dar → no se ofrece tarificar: repregunta F2 con eso.
//   · Ramo sin bot → «sin bot para <ramo>»; NO se ofrece pagar Avant2 por defecto (hueco declarado: el botón de Avant2,
//     `clp_cds`, no existe todavía; el precio de Avant2 sigue por el asistente, `cas_tarif`, con su 0,50€ y su tope).
//   · Tope diario: lo que no cabe queda EN COLA y llega «⛔ Tope diario (20) alcanzado: N en cola» con
//     ➕ `clp_top:<aaaammdd>` («10 más hoy»).
// 🚨 Solo nombres de compañía, etiquetas y conteos: ningún valor personal llega a Telegram.
import { escapeHtml, type Boton } from '@central/core-telegram'
import { etiquetasDe } from '@central/module-seguros'
import { PREFIJO_CLP } from './lead-correduria-peticion.ts'

export const AVISO_TARIFICAR_LEAD = 'correduria.lead-tarificar'

const obj = (v: unknown): Record<string, unknown> => (typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : {})
const lista = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string').slice(0, 40) : [])
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)

// ─── La revisión de asegura ───────────────────────────────────────────────────

export type CompaniaRevisada =
  | { compania: string; estado: 'lista' }
  | { compania: string; estado: 'faltan'; preguntar: string[]; noLeidas: string[]; otros: string[] }
  | { compania: string; estado: 'sin_declaracion' }

export type OportunidadRevisada = {
  id: string; ramo: string; estado: 'sin_bot' | 'sin_formulario' | 'evaluada'
  companias: CompaniaRevisada[]; supuestos: string[]; noLeidos: string[]
}

export type Revision =
  | { estado: 'ok'; rpaActivo: boolean; oportunidades: OportunidadRevisada[]; contador: { usadas: number; tope: number } | null }
  | { estado: 'error'; motivo: string }

/** Respuesta de `accion:'revisar'`. Lo desconocido es `error` (no se ofrece tarificar), nunca «todo listo». PURA. */
export function leerRevision(status: number, json: unknown): Revision {
  const o = obj(json)
  if (status !== 200 || o.estado !== 'ok' || !Array.isArray(o.oportunidades)) {
    return { estado: 'error', motivo: typeof o.estado === 'string' ? `asegura: ${String(o.estado).slice(0, 40)}` : `HTTP ${status}` }
  }
  const ops: OportunidadRevisada[] = o.oportunidades.map(obj).filter((x) => typeof x.id === 'string' && typeof x.ramo === 'string').map((x) => ({
    id: x.id as string,
    ramo: x.ramo as string,
    estado: x.estado === 'evaluada' || x.estado === 'sin_formulario' ? x.estado : 'sin_bot',
    companias: (Array.isArray(x.companias) ? x.companias : []).map(obj).filter((c) => typeof c.compania === 'string').map((c): CompaniaRevisada => {
      const compania = String(c.compania).slice(0, 40)
      if (c.estado === 'lista') return { compania, estado: 'lista' }
      if (c.estado === 'faltan') return { compania, estado: 'faltan', preguntar: lista(c.preguntar), noLeidas: lista(c.noLeidas), otros: lista(c.otros) }
      return { compania, estado: 'sin_declaracion' }
    }),
    supuestos: (Array.isArray(x.supuestos) ? x.supuestos : []).map(obj).map((s) => (typeof s.texto === 'string' ? s.texto.slice(0, 160) : '')).filter(Boolean),
    noLeidos: lista(x.noLeidos),
  }))
  const c = obj(o.contador)
  const usadas = num(c.usadas)
  const tope = num(c.tope)
  const extra = num(c.extra) ?? 0
  return {
    estado: 'ok', rpaActivo: o.rpaActivo === true, oportunidades: ops,
    contador: usadas !== null && tope !== null ? { usadas, tope: Math.min(tope + extra, 100) } : null,
  }
}

export type Oferta =
  /** ≥1 compañía llegaría a precio: aviso con 🤖. */
  | { tipo: 'boton' }
  /** A los bots les falta algo que el cliente puede dar: repregunta F2 con ESAS claves (no se ofrece tarificar). */
  | { tipo: 'repregunta'; preguntar: string[] }
  /** Nada que lanzar ni que preguntar (sin bot, no leídos, otra persona al volante…): solo el aviso. */
  | { tipo: 'aviso' }

/** Qué se hace con la revisión. PURA. */
export function decidirOferta(r: Extract<Revision, { estado: 'ok' }>): Oferta {
  const evaluadas = r.oportunidades.filter((o) => o.estado === 'evaluada')
  if (evaluadas.some((o) => o.companias.some((c) => c.estado === 'lista'))) return { tipo: 'boton' }
  const preguntar = new Set(evaluadas.flatMap((o) => o.companias.flatMap((c) => (c.estado === 'faltan' ? c.preguntar : []))))
  if (preguntar.size) return { tipo: 'repregunta', preguntar: [...preguntar] }
  return { tipo: 'aviso' }
}

// ─── El aviso §3.3 ────────────────────────────────────────────────────────────

const NOMBRE_CIA: Record<string, string> = { mapfre: 'Mapfre', allianz: 'Allianz', generali: 'Generali', occident: 'Occident', axa: 'AXA' }
const cia = (c: string) => NOMBRE_CIA[c] ?? c.charAt(0).toUpperCase() + c.slice(1)
const RAMO: Record<string, string> = { auto: 'coche', moto: 'moto', hogar: 'hogar', comunidades: 'comunidades', vida: 'vida', salud: 'salud', decesos: 'decesos' }
const ramoTxt = (r: string) => RAMO[r] ?? r.replace(/_/g, ' ')
const y = (xs: readonly string[]) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} y ${xs[xs.length - 1]}`)

/** «Hoy: 7/20 tarificaciones con bots» (o que no se ha podido contar). PURA. */
export function lineaContador(c: { usadas: number; tope: number } | null): string {
  return c ? `Hoy: ${c.usadas}/${c.tope} tarificaciones con bots` : 'Hoy: no he podido contar las tarificaciones con bots (sin el contador no se lanza nada)'
}

/**
 * El cuerpo del aviso (HTML seguro): qué compañías se lanzarían por ramo, las que no y por qué (etiquetas), lo supuesto,
 * los ramos sin bot y el contador. Sin € (los bots no cuestan; Avant2 no se ofrece aquí). PURA.
 */
export function textoTarificar(a: { id: number | string | null; pila: string | null; revision: Extract<Revision, { estado: 'ok' }> }): string {
  const ops = a.revision.oportunidades
  const ramos = [...new Set(ops.map((o) => o.ramo))]
  const l: string[] = [`🧮 <b>Listo para tarificar · ${escapeHtml(ramos.map(ramoTxt).join(' y ') || 'sin ramo')}${a.pila ? ` · ${escapeHtml(a.pila)}` : ''}</b>`]
  for (const o of ops) {
    if (o.estado === 'sin_bot') { l.push(`🚫 Sin bot para ${escapeHtml(ramoTxt(o.ramo))}: no se lanza nada (no te propongo pagar Avant2 por defecto).`); continue }
    if (o.estado === 'sin_formulario') { l.push(`🚫 Hay bot de ${escapeHtml(ramoTxt(o.ramo))}, pero el formulario no se arma aún desde el correo del lead: pídelo desde la ficha.`); continue }
    const listas = o.companias.filter((c) => c.estado === 'lista').map((c) => cia(c.compania))
    if (listas.length) l.push(`🤖 Se lanzarían (${escapeHtml(ramoTxt(o.ramo))}, gratis en su portal): <b>${escapeHtml(y(listas))}</b>`)
    for (const c of o.companias) {
      if (c.estado === 'sin_declaracion') l.push(`· ${escapeHtml(cia(c.compania))}: su bot no declara qué necesita, no se lanza`)
      if (c.estado !== 'faltan') continue
      const partes: string[] = []
      if (c.preguntar.length) partes.push(`falta ${y(etiquetasDe([o.ramo], new Set(c.preguntar)))}`)
      if (c.noLeidas.length) partes.push(`no sé leer sin adivinar ${y(etiquetasDe([o.ramo], new Set(c.noLeidas)))} (corrígelo en la ficha)`)
      if (c.otros.length) partes.push(c.otros.join('; '))
      l.push(`· ${escapeHtml(cia(c.compania))} no: ${escapeHtml(partes.join(' · '))}`)
    }
    if (o.supuestos.length) l.push(`Supuestos: ${escapeHtml(o.supuestos.join(' · '))}`)
  }
  l.push(escapeHtml(lineaContador(a.revision.contador)))
  if (!a.revision.rpaActivo) l.push('🛑 <b>Los bots están APAGADOS</b> (TARIFICADOR_RPA_ACTIVO): el botón no lanzará nada hasta que se enciendan.')
  if (a.id !== null) l.push(`<i>Nada se lanza sin pulsar 🤖 · #clp${a.id}</i>`)
  return l.join('\n')
}

export function botonesTarificar(id: number | string): Boton[][] {
  return [
    [{ texto: '🤖 Tarificar con bots', callback: `${PREFIJO_CLP}_tar:${id}` }],
    [{ texto: '✏️ Corregir un dato', callback: `${PREFIJO_CLP}_edt:${id}` }, { texto: '⏸ Esperar', callback: `${PREFIJO_CLP}_no:${id}` }],
  ]
}

/** `aaaa-mm-dd` → el botón «➕ 10 más hoy» (`clp_top:aaaammdd`, sin datos personales). PURA. */
export function botonTope(dia: string): Boton[][] {
  return [[{ texto: '➕ 10 más hoy', callback: `${PREFIJO_CLP}_top:${dia.replace(/-/g, '')}` }]]
}

export function textoTope(a: { tope: number; enCola: number }): string {
  return `⛔ <b>Tope diario (${a.tope}) de tarificaciones con bots alcanzado</b>: ${a.enCola} en cola (no se ha lanzado nada; no se descarta). Con ➕ amplías 10 más hoy y salen los de la cola.`
}

// ─── Lo que contesta `accion:'tarificar'` ─────────────────────────────────────

export type Trabajo = { compania: string; estado: 'encolado' | 'duplicado' | 'rechazado'; motivo: string | null }
export type ResultadoTarificar =
  | { estado: 'encolado'; trabajos: Trabajo[]; usadas: number | null; tope: number | null }
  | { estado: 'nada'; revision: Revision }
  | { estado: 'tope'; usadas: number | null; tope: number | null; dia: string }
  | { estado: 'apagado' | 'sin_tabla' | 'sin_contador' }
  /** No se sabe si se encoló algo (red, 5xx, respuesta rara): NUNCA se reintenta solo. */
  | { estado: 'incierto'; motivo: string }

const DIA = /^\d{4}-\d{2}-\d{2}$/

/** Respuesta → qué pasó. Lo desconocido es «incierto», jamás «no se lanzó». PURA. */
export function leerTarificar(status: number, json: unknown): ResultadoTarificar {
  const o = obj(json)
  if (status === 200 && o.estado === 'encolado' && Array.isArray(o.trabajos)) {
    const trabajos = o.trabajos.map(obj).filter((t) => typeof t.compania === 'string').map((t): Trabajo => ({
      compania: String(t.compania).slice(0, 40),
      estado: t.estado === 'encolado' || t.estado === 'duplicado' ? t.estado : 'rechazado',
      motivo: typeof t.motivo === 'string' ? t.motivo.slice(0, 60) : null,
    }))
    return { estado: 'encolado', trabajos, usadas: num(o.usadas), tope: num(o.tope) }
  }
  if (status === 200 && o.estado === 'nada') return { estado: 'nada', revision: leerRevision(200, o.revision) }
  if (status === 409 && o.estado === 'tope' && typeof o.dia === 'string' && DIA.test(o.dia)) return { estado: 'tope', usadas: num(o.usadas), tope: num(o.tope), dia: o.dia }
  if (status === 503 && (o.estado === 'apagado' || o.estado === 'sin_tabla' || o.estado === 'sin_contador')) return { estado: o.estado }
  return { estado: 'incierto', motivo: typeof o.estado === 'string' ? `asegura: ${String(o.estado).slice(0, 40)}` : `HTTP ${status}` }
}

/** Qué hace el pendiente tras pulsar 🤖: se cierra, vuelve a esperar el botón o queda en cola. PURA. */
export function estadoPendienteTras(r: ResultadoTarificar): 'enviado' | 'fallido' | 'incierto' | 'pendiente' | 'cola' {
  switch (r.estado) {
    case 'encolado': return r.trabajos.some((t) => t.estado !== 'rechazado') ? 'enviado' : 'fallido'
    case 'nada': return 'fallido'
    case 'tope': return 'cola'
    case 'apagado': case 'sin_tabla': case 'sin_contador': return 'pendiente' // no se ha hecho nada: el botón sigue vivo
    case 'incierto': return 'incierto'
  }
}

/**
 * Tras 🤖, si el pendiente sigue vivo (no se ha hecho nada, o quedó EN COLA por el tope), el texto del mensaje nuevo que
 * vuelve a traer sus botones; `null` si ya no hay nada que pulsar. Sin esto, lo que quedó en cola un día y no salió con ➕
 * se quedaba sin botón (el pulsado los pierde) hasta caducar: «cola, nunca descarte». PURA.
 */
export function textoBotonVivo(r: ResultadoTarificar, id: number | string): string | null {
  const tras = estadoPendienteTras(r)
  if (tras === 'pendiente') return `🧮 Sigue pendiente de tarificar (#clp${id}).`
  if (tras === 'cola') return `⏳ En cola por el tope de hoy (#clp${id}): sale con ➕ o volviendo a pulsar 🤖 otro día. No se ha lanzado nada.`
  return null
}

/** La línea que sustituye a los botones tras pulsar 🤖. PURA. */
export function lineaTrasTarificar(r: ResultadoTarificar): string {
  switch (r.estado) {
    case 'encolado': {
      const ok = r.trabajos.filter((t) => t.estado === 'encolado').map((t) => cia(t.compania))
      const ya = r.trabajos.filter((t) => t.estado === 'duplicado').map((t) => cia(t.compania))
      const no = r.trabajos.filter((t) => t.estado === 'rechazado').map((t) => `${cia(t.compania)}${t.motivo ? ` (${t.motivo})` : ''}`)
      const l: string[] = []
      if (ok.length) l.push(`🤖 <b>Bots en marcha</b>: ${escapeHtml(y(ok))}. Los precios llegan a su oportunidad (y a /correduria/tarificador).`)
      if (ya.length) l.push(`↩️ Ya estaban en marcha con los mismos datos (no se repiten): ${escapeHtml(y(ya))}.`)
      if (no.length) l.push(`❌ No se han encolado: ${escapeHtml(no.join(', '))}.`)
      if (r.usadas !== null && r.tope !== null) l.push(escapeHtml(lineaContador({ usadas: r.usadas, tope: r.tope })))
      return l.join('\n')
    }
    case 'nada':
      return '❌ <b>No se ha lanzado ningún bot</b>: con los datos de ahora ninguna compañía llega a precio (te digo qué falta en un mensaje aparte).'
    case 'tope':
      return `⛔ Tope diario alcanzado${r.tope !== null ? ` (${r.tope})` : ''}: <b>queda en cola</b>, no se ha lanzado nada.`
    case 'apagado':
      return '🛑 <b>Los bots están apagados</b> (TARIFICADOR_RPA_ACTIVO): no se ha lanzado nada. El botón sigue vivo.'
    case 'sin_tabla':
      return '🛑 Falta el SQL del contador diario en asegura (2026-10-19d): no tarifico sin poder contar. El botón sigue vivo.'
    case 'sin_contador':
      return '⚠️ No he podido contar las tarificaciones de hoy: no se ha lanzado nada. Prueba en un rato (el botón sigue vivo).'
    case 'incierto':
      return `⚠️ <b>No sé si se han encolado</b> (${escapeHtml(r.motivo)}). Míralo en /correduria/tarificador ANTES de repetir: no se reintenta solo.`
  }
}

/** Respuesta de `accion:'ampliar_tope'`. PURA. */
export function leerAmpliar(status: number, json: unknown): { estado: 'ok'; usadas: number; tope: number } | { estado: 'sin_tabla' | 'error' } {
  const o = obj(json)
  if (status === 200 && o.estado === 'ok' && num(o.usadas) !== null && num(o.tope) !== null) return { estado: 'ok', usadas: o.usadas as number, tope: o.tope as number }
  return { estado: status === 503 && o.estado === 'sin_tabla' ? 'sin_tabla' : 'error' }
}
