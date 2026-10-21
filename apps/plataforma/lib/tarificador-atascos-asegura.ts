// BOTS ATASCADOS y PAUSAS del tarificador (F2 del plan de robustez, 14/10/2026) — la parte de PLATAFORMA. El estado vive en
// asegura (`/api/operador/tarificador/atascos`, `/atascos/[id]`, `/pausas/[id]`); aquí:
//   · lo PURO (con test): leer las respuestas del puerto, componer los Telegram y decidir una pulsación de botón;
//   · la RED (solo servidor: cron, webhook de Telegram y rutas `/api/correduria/tarificador/*`).
//
// Telegram (cron cada 10 min, `correduria.tarificador-atasco` / `correduria.tarificador-pausa`, catalogados):
//   · atasco → la captura (si la hay) + texto con los elementos NUMERADOS + un botón por número (`atq_e:<atasco>:<n>`) y
//     «❌ Descartar» (`atq_x:<atasco>`); la lista entera y la pantalla en /correduria/tarificador («Bots atascados»).
//   · pausa → texto + «▶️ Reanudar» (`tpa_r:<pausa>`).
//   Las pulsaciones: SOLO `from.id == TELEGRAM_CHAT_ID` (en un grupo cualquiera pulsaría). Responder no emite nada: el
//   elemento se APRENDE y el worker lo revalida con sus tablas cerradas al repetir el camino.
//
// 🚨 Sin datos personales en Telegram: compañía, ramo, qué se buscaba y los textos de los candidatos YA redactados en el
//    worker y en asegura. La captura de la pantalla va SOLO al chat de Alberto (como la de la emisión) y NUNCA la que muestra
//    datos del tomador (`capturaConDatos`, 21/10/2026: asegura la quita de los avisos; esa solo se ve en «Bots atascados»).
// 🚨 Un fallo del puerto NO es «no hay atascos»: se dice con su causa.

import { cabecerasPuerto } from './puerto-actor.ts'

export const PREFIJO_ATASCO = 'atq'
export const PREFIJO_PAUSA = 'tpa'
/** Botones numerados como mucho (los demás, en la pantalla). Telegram admite más, pero el mensaje deja de leerse. */
export const MAX_BOTONES_ATASCO = 12

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const obj = (v: unknown): Record<string, unknown> | null => (typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : null)
const cadena = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v.trim() : null)
const entero = (v: unknown): number | null => (typeof v === 'number' && Number.isInteger(v) ? v : null)

// ─── Lectura del puerto (PURO) ───────────────────────────────────────────────

export type CandidatoVisible = { n: number; tag: string; id: string | null; type: string | null; role: string | null; texto: string | null; etiqueta: string | null }

export type Atasco = {
  id: string
  trabajoId: string
  oportunidadId: string | null
  compania: string
  ramo: string
  tipo: 'campo' | 'accion'
  descripcion: string
  etiqueta: string | null
  textoEsperado: string | null
  candidatos: CandidatoVisible[]
  ronda: number | null
  maxRondas: number | null
  creadoEn: string
  caducaEn: string
  hayCaptura: boolean
  capturaBase64: string | null
  /** Tipo de la captura (las de atasco desde el 21/10/2026 son JPEG). */
  capturaMime: 'image/png' | 'image/jpeg'
  /** Clave del paso (`elegir_opcion_<campo>` = elegir en una lista). `''` si asegura es anterior. */
  clave: string
  /** Nombre del cliente (solo pantalla; nunca Telegram). `null` = sin cliente o asegura anterior. */
  clienteNombre: string | null
  /** Opciones de lista que vio el bot: `null` = no se miraron; `[]` = no había ninguna visible. */
  opciones: string[] | null
  /** La captura puede llevar datos del tomador. FAIL-CLOSED: solo un `false` explícito de asegura la libera (Telegram). */
  capturaConDatos: boolean
}

export type Pausa = { id: string; compania: string; ramo: string; motivo: string; pausadaEn: string; pendientes: number | null }

export type LecturaAtascos =
  | { estado: 'ok'; atascos: Atasco[]; pausas: Pausa[]; ilegibles: number }
  | { estado: 'sin_esquema' }
  | { estado: 'sin_configurar' }
  | { estado: 'error'; causa: string }

function candidato(v: unknown): CandidatoVisible | null {
  const o = obj(v)
  const n = entero(o?.n)
  const tag = cadena(o?.tag)
  if (!o || n === null || n < 1 || !tag) return null
  return { n, tag, id: cadena(o.id), type: cadena(o.type), role: cadena(o.role), texto: cadena(o.texto), etiqueta: cadena(o.etiqueta) }
}

export function atascoValido(v: unknown): Atasco | null {
  const o = obj(v)
  if (!o) return null
  const id = cadena(o.id), trabajoId = cadena(o.trabajoId), compania = cadena(o.compania), descripcion = cadena(o.descripcion)
  const creadoEn = cadena(o.creadoEn), caducaEn = cadena(o.caducaEn)
  const tipo = o.tipo === 'campo' || o.tipo === 'accion' ? o.tipo : null
  if (!id || !UUID.test(id) || !trabajoId || !UUID.test(trabajoId) || !compania || !descripcion || !tipo || !creadoEn || !caducaEn || !Array.isArray(o.candidatos)) return null
  const candidatos = o.candidatos.map(candidato)
  // Una lista con un hueco no se enseña a medias: Alberto elegiría un número que no es el que cree.
  if (!candidatos.length || candidatos.some((c) => c === null)) return null
  return {
    id, trabajoId, oportunidadId: cadena(o.oportunidadId), compania, ramo: cadena(o.ramo) ?? '', tipo, descripcion,
    etiqueta: cadena(o.etiqueta), textoEsperado: cadena(o.textoEsperado), candidatos: candidatos as CandidatoVisible[],
    // Tres estados: sin dato → null («—»), nunca 0.
    ronda: entero(o.ronda), maxRondas: entero(o.maxRondas), creadoEn, caducaEn, hayCaptura: o.hayCaptura === true,
    capturaBase64: typeof o.capturaBase64 === 'string' && /^[A-Za-z0-9+/]+=*$/.test(o.capturaBase64) ? o.capturaBase64 : null,
    capturaMime: o.capturaMime === 'image/jpeg' ? 'image/jpeg' : 'image/png',
    clave: cadena(o.clave) ?? '',
    clienteNombre: cadena(o.clienteNombre),
    capturaConDatos: o.capturaConDatos !== false,
    opciones: Array.isArray(o.opciones) ? o.opciones.map(cadena).filter((x): x is string => x !== null).slice(0, 30) : null,
  }
}

// ─── Tarjeta de la pantalla (PURO) ───────────────────────────────────────────

/** Etiquetas de opción de lista (Angular Material, NDBX de Allianz, ARIA, `<option>`). */
const TAGS_OPCION = new Set(['mat-option', 'nx-autocomplete-option', 'nx-dropdown-item', 'option'])

/** ¿El candidato es una OPCIÓN de lista (y no una etiqueta o un campo de la pantalla)? PURO. */
export function esCandidatoOpcion(c: Pick<CandidatoVisible, 'tag' | 'role'>): boolean {
  return c.role === 'option' || TAGS_OPCION.has(c.tag)
}

/** ¿El atasco es de ELEGIR UNA OPCIÓN de una lista desplegable? PURO. */
export function esAtascoDeOpcion(a: Pick<Atasco, 'clave'>): boolean {
  return /^elegir_opcion(_|$)/.test(a.clave)
}

const CAMPOS_LEGIBLES: Record<string, string> = { poblacion: 'población', via: 'vía', municipio: 'municipio', provincia: 'provincia' }

/** «población», «vía»… del campo de un atasco de lista. PURO. */
export function campoDeOpcion(clave: string): string {
  const x = clave.replace(/^elegir_opcion_?/, '')
  return CAMPOS_LEGIBLES[x] ?? (x.replace(/_/g, ' ').trim() || 'opción')
}

/** Frase llana de DÓNDE se ha parado el bot («elegir la población en la lista desplegable»). PURO. */
export function paradoEn(a: Pick<Atasco, 'clave' | 'tipo' | 'descripcion' | 'etiqueta' | 'textoEsperado'>): string {
  if (esAtascoDeOpcion(a)) return `elegir la ${campoDeOpcion(a.clave)} en la lista desplegable`
  if (a.clave === 'hueco_mapa') {
    // «Pantalla o paso sin mapa: allianz/hogar: mapa incompleto: faltan la elección de…» → «la elección de…».
    const t = a.descripcion.replace(/^Pantalla o paso sin mapa:\s*/i, '').replace(/^[\w-]+\/[\w-]+:\s*/, '').replace(/^mapa incompleto:\s*(faltan?\s+)?/i, '')
    return t || 'una pantalla que todavía no conoce'
  }
  if (a.tipo === 'campo') return `el campo «${a.etiqueta ?? a.descripcion}»`
  return `el botón «${a.textoEsperado ?? a.descripcion}»`
}

export type BotonAtasco = { n: number; texto: string }

export type VistaAtasco = {
  titulo: string
  paradoEn: string
  /** `opciones` = botones con las opciones de la lista · `elementos` = botones con lo que hay en pantalla · `sin_opciones`. */
  modo: 'opciones' | 'elementos' | 'sin_opciones'
  botones: BotonAtasco[]
  /** Textos que vio el bot en la lista y que no se pueden pulsar desde aquí (solo informativo). `null` = no se miró. */
  opcionesVistas: string[] | null
  captura: 'hay' | 'sin_captura'
  /** Solo en `sin_opciones`: `vacia` (opciones = []: la lista no llegó a abrirse) · `sin_leer` (null: no se pudo leer) · `hay`. */
  opcionesLeidas: 'vacia' | 'sin_leer' | 'hay'
}

/**
 * Lo que pinta la tarjeta de un atasco, en castellano llano. Un atasco de LISTA solo ofrece como botón lo que sea una opción de
 * lista (una etiqueta «Tipo de documento» no es una población); si no hay ninguna, `sin_opciones` y se dice. PURO.
 */
export function vistaAtasco(a: Atasco): VistaAtasco {
  const titulo = `${nombre(a.compania)} · ${a.ramo || 'ramo'}`
  const captura = a.hayCaptura ? 'hay' as const : 'sin_captura' as const
  const texto = (c: CandidatoVisible) => (c.texto ?? c.etiqueta ?? c.id ?? `Elemento ${c.n}`).slice(0, 120)
  if (esAtascoDeOpcion(a)) {
    const botones = a.candidatos.filter(esCandidatoOpcion).map((c) => ({ n: c.n, texto: texto(c) }))
    const pulsables = new Set(botones.map((b) => b.texto))
    const opcionesVistas = a.opciones === null ? null : a.opciones.filter((o) => !pulsables.has(o))
    return { titulo, paradoEn: paradoEn(a), modo: botones.length ? 'opciones' : 'sin_opciones', botones, opcionesVistas, captura, opcionesLeidas: a.opciones === null ? 'sin_leer' : a.opciones.length === 0 ? 'vacia' : 'hay' }
  }
  return { titulo, paradoEn: paradoEn(a), modo: 'elementos', botones: a.candidatos.map((c) => ({ n: c.n, texto: lineaCandidato(c).replace(/^\d+ · /, '') })), opcionesVistas: null, captura, opcionesLeidas: a.opciones === null ? 'sin_leer' : a.opciones.length === 0 ? 'vacia' : 'hay' }
}

/** Enlace al bloque «Pedir precio» de la oportunidad (para relanzar tras descartar). `null` sin oportunidad. PURO. */
export function enlacePedirPrecio(oportunidadId: string | null): string | null {
  return oportunidadId && UUID.test(oportunidadId) ? `/correduria/oportunidad/${oportunidadId}#pedir-precio` : null
}

function pausaValida(v: unknown): Pausa | null {
  const o = obj(v)
  const id = cadena(o?.id), compania = cadena(o?.compania), pausadaEn = cadena(o?.pausadaEn)
  if (!o || !id || !UUID.test(id) || !compania || !pausadaEn) return null
  return { id, compania, ramo: cadena(o.ramo) ?? '', motivo: cadena(o.motivo) ?? 'Varios fallos seguidos del bot.', pausadaEn, pendientes: entero(o.pendientes) }
}

/** PURO. Respuesta de `GET …/atascos` → lista o error CON causa. Una fila rara no desaparece: se cuenta. */
export function interpretarAtascos(status: number, json: unknown): LecturaAtascos {
  const o = obj(json) ?? {}
  if (status === 503 && o.estado === 'sin_configurar') return { estado: 'sin_configurar' }
  if (status === 401 || status === 403) return { estado: 'error', causa: 'asegura rechaza el secreto (ASEGURA_OPERADOR_SECRET)' }
  if (status === 404) return { estado: 'error', causa: 'asegura aún no tiene /api/operador/tarificador/atascos desplegado' }
  if (o.estado === 'sin_esquema') return { estado: 'sin_esquema' }
  if (status !== 200 || o.estado !== 'ok' || !Array.isArray(o.atascos) || !Array.isArray(o.pausas)) return { estado: 'error', causa: cadena(o.causa) ?? `respuesta ilegible (HTTP ${status})` }
  let ilegibles = entero(o.ilegibles) ?? 0
  const atascos: Atasco[] = []
  for (const a of o.atascos) { const v = atascoValido(a); if (v) atascos.push(v); else ilegibles++ }
  const pausas: Pausa[] = []
  for (const p of o.pausas) { const v = pausaValida(p); if (v) pausas.push(v); else ilegibles++ }
  return { estado: 'ok', atascos, pausas, ilegibles }
}

// ─── Telegram (PURO) ─────────────────────────────────────────────────────────

const escapar = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const nombre = (c: string): string => (c ? c.charAt(0).toUpperCase() + c.slice(1) : 'La compañía')

function hora(iso: string): string {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString('es-ES', { timeZone: 'Europe/Madrid', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

/** Una línea por candidato: «3 · Superficie construida (campo de texto)». Sin selector ni valores. PURO. */
export function lineaCandidato(c: CandidatoVisible): string {
  const que = c.texto ?? c.etiqueta ?? c.id ?? '(sin texto)'
  const forma = c.tag === 'select' ? 'desplegable' : c.tag === 'textarea' ? 'texto largo' : c.tag === 'input' ? `campo${c.type ? ` ${c.type}` : ''}` : c.tag
  const extra = c.texto && c.etiqueta && c.etiqueta !== c.texto ? ` · ${c.etiqueta}` : ''
  return `${c.n} · ${que}${extra} (${forma})`.slice(0, 160)
}

/** El Telegram (HTML) de UN atasco. Lista hasta 20 (los botones, hasta `MAX_BOTONES_ATASCO`). PURO. */
export function componerAvisoAtasco(a: Atasco): string {
  const que = a.tipo === 'campo' ? `no encuentra el campo «${escapar(a.etiqueta ?? a.descripcion)}»` : `no encuentra el botón «${escapar(a.textoEsperado ?? a.descripcion)}»`
  const ronda = a.ronda !== null && a.maxRondas !== null ? ` · intento ${a.ronda} de ${a.maxRondas}` : ''
  const lista = a.candidatos.map((c) => escapar(lineaCandidato(c))).join('\n')
  const mas = a.candidatos.length > MAX_BOTONES_ATASCO ? `\n(Del ${MAX_BOTONES_ATASCO + 1} en adelante, en «Bots atascados».)` : ''
  return `🧩 <b>Bot atascado</b>: ${escapar(nombre(a.compania))} · ${escapar(a.ramo || 'ramo')}${ronda}\n` +
    `El bot ${que} y ni lo aprendido ni la IA lo resuelven. ¿Cuál es?\n${lista}${mas}\n` +
    `Pulsa el número: se aprende y el bot repite el presupuesto (solo precio; nunca contrata). Caduca ${hora(a.caducaEn)}.`
}

/** Botones del atasco: números en filas de 4 + «❌ Descartar». callback ≤ 64 bytes: `atq_e:<uuid>:<n>` = 45. PURO. */
export function botonesAtasco(a: Pick<Atasco, 'id' | 'candidatos'>): { texto: string; callback: string }[][] {
  const nums = a.candidatos.slice(0, MAX_BOTONES_ATASCO).map((c) => ({ texto: String(c.n), callback: `${PREFIJO_ATASCO}_e:${a.id}:${c.n}` }))
  const filas: { texto: string; callback: string }[][] = []
  for (let i = 0; i < nums.length; i += 4) filas.push(nums.slice(i, i + 4))
  filas.push([{ texto: '❌ Descartar', callback: `${PREFIJO_ATASCO}_x:${a.id}` }])
  return filas
}

export function componerAvisoPausa(p: Pausa): string {
  const pend = p.pendientes !== null && p.pendientes > 0 ? `\nHay ${p.pendientes} presupuesto(s) esperando en cola.` : ''
  return `⏸️ <b>Bot en pausa</b>: ${escapar(nombre(p.compania))} · ${escapar(p.ramo || 'ramo')}\n${escapar(p.motivo)}\n` +
    `No se piden más precios a ${escapar(nombre(p.compania))} en este ramo hasta que lo reanudes (mira antes si su portal ha cambiado).${pend}`
}

export function botonesPausa(p: Pick<Pausa, 'id'>): { texto: string; callback: string }[][] {
  return [[{ texto: '▶️ Reanudar', callback: `${PREFIJO_PAUSA}_r:${p.id}` }]]
}

export type DecisionBotonAtasco =
  | { ok: true; tipo: 'elegir'; atascoId: string; n: number; quien: string }
  | { ok: true; tipo: 'descartar'; atascoId: string; quien: string }
  | { ok: true; tipo: 'reanudar'; pausaId: string; quien: string }
  | { ok: false; toast: string }

/**
 * ¿Vale esta pulsación? Solo la PERSONA autorizada (from.id EXACTO = `TELEGRAM_CHAT_ID`; sin chat configurado, nadie) y
 * callbacks bien formados: `atq_e:<uuid>:<n>`, `atq_x:<uuid>`, `tpa_r:<uuid>`. PURO.
 */
export function decidirBotonAtasco(cb: { from?: { id?: unknown } | null } | null | undefined, prefijo: string, accion: string, args: readonly string[], chatAutorizado: string | undefined): DecisionBotonAtasco {
  const esperado = String(chatAutorizado ?? '').trim()
  const quien = String(cb?.from?.id ?? '').trim()
  if (!esperado || !quien || quien !== esperado) return { ok: false, toast: 'Solo el titular puede hacerlo' }
  const id = args[0] ?? ''
  if (!UUID.test(id)) return { ok: false, toast: 'Botón no válido' }
  if (prefijo === PREFIJO_ATASCO && accion === 'e' && args.length === 2 && /^\d{1,2}$/.test(args[1] ?? '')) {
    const n = Number(args[1])
    if (n >= 1 && n <= 20) return { ok: true, tipo: 'elegir', atascoId: id, n, quien }
  }
  if (prefijo === PREFIJO_ATASCO && accion === 'x' && args.length === 1) return { ok: true, tipo: 'descartar', atascoId: id, quien }
  if (prefijo === PREFIJO_PAUSA && accion === 'r' && args.length === 1) return { ok: true, tipo: 'reanudar', pausaId: id, quien }
  return { ok: false, toast: 'Botón no válido' }
}

/** Línea que sustituye a los botones tras pulsar. PURO. */
export function lineaTrasAtasco(d: Exclude<DecisionBotonAtasco, { ok: false }>, r: { status: number; json: unknown }): string {
  const o = obj(r.json) ?? {}
  const estado = cadena(o.estado)
  if (d.tipo === 'reanudar') {
    if (estado === 'reanudada') return '▶️ <i>Reanudado: el bot vuelve a pedir precios a esta compañía en este ramo.</i>'
    if (estado === 'sin_cambios') return '<i>Ya estaba reanudado.</i>'
  } else if (estado === 'respondido') {
    const pausa = o.pausada === true ? ' Ojo: la compañía está en PAUSA; no correrá hasta que la reanudes.' : ''
    return `✅ <i>Elegido el ${d.tipo === 'elegir' ? d.n : '—'}: queda aprendido y el bot repite el presupuesto.${pausa}</i>`
  } else if (estado === 'descartado') {
    return '❌ <i>Descartado: el trabajo se cancela.</i>'
  } else if (estado === 'sin_cambios') {
    return '<i>Ya estaba hecho.</i>'
  }
  const motivo = cadena(o.motivo) ?? cadena(o.mensaje) ?? `HTTP ${r.status}`
  return `⚠️ <i>No se ha podido: ${escapar(motivo)}</i>`
}

// ─── Red (solo servidor) ─────────────────────────────────────────────────────

function urlAsegura(): string {
  return (process.env.ASEGURA_URL || 'https://central-asegura.vercel.app').replace(/\/$/, '')
}

/** Llamada al puerto. Sin secreto → 503 `sin_configurar`; red caída → 502. `actor` explícito para Telegram. */
export async function puertoRobustez(ruta: string, init: RequestInit, actor?: string, topeMs = 25_000): Promise<{ status: number; json: unknown }> {
  const secret = process.env.ASEGURA_OPERADOR_SECRET
  if (!secret) return { status: 503, json: { estado: 'sin_configurar' } }
  try {
    const res = await fetch(`${urlAsegura()}/api/operador/tarificador/${ruta}`, {
      ...init,
      headers: { 'Content-Type': 'application/json', ...(init.headers ?? {}), ...(await cabecerasPuerto(secret, actor)) },
      cache: 'no-store',
      signal: AbortSignal.timeout(topeMs),
    })
    return { status: res.status, json: await res.json().catch(() => null) }
  } catch {
    return { status: 502, json: { estado: 'error', motivo: 'red' } }
  }
}

export async function leerAtascosAsegura(soloAvisos: boolean): Promise<LecturaAtascos> {
  const r = await puertoRobustez(`atascos${soloAvisos ? '?avisos=1' : ''}`, { method: 'GET' })
  if (r.status === 502) return { estado: 'error', causa: 'no se pudo llegar a asegura (red)' }
  return interpretarAtascos(r.status, r.json)
}

/** Marca avisados (idempotente al otro lado). `true` solo con `{estado:'ok'}`. */
export async function marcarAtascosAvisados(ids: { atascos: string[]; pausas: string[] }): Promise<boolean> {
  if (!ids.atascos.length && !ids.pausas.length) return true
  const r = await puertoRobustez('atascos', { method: 'POST', body: JSON.stringify(ids) })
  return r.status === 200 && obj(r.json)?.estado === 'ok'
}

/** Actor de una pulsación de Telegram (formato del puerto: `agente:<id>`). */
export const actorTelegram = (fromId: string): string => `agente:telegram-${fromId.replace(/[^0-9]/g, '').slice(0, 30) || 'desconocido'}`

/** Reenvía la pulsación a asegura. */
export async function aplicarBotonAtasco(d: Exclude<DecisionBotonAtasco, { ok: false }>): Promise<{ status: number; json: unknown }> {
  const actor = actorTelegram(d.quien)
  if (d.tipo === 'reanudar') return puertoRobustez(`pausas/${encodeURIComponent(d.pausaId)}`, { method: 'POST', body: JSON.stringify({ accion: 'reanudar' }) }, actor, 50_000)
  const cuerpo = d.tipo === 'elegir' ? { accion: 'elegir', n: d.n } : { accion: 'descartar' }
  return puertoRobustez(`atascos/${encodeURIComponent(d.atascoId)}`, { method: 'POST', body: JSON.stringify(cuerpo) }, actor, 50_000)
}
