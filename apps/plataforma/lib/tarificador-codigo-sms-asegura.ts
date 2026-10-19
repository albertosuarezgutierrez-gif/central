// RELEVO DEL CÓDIGO SMS por Telegram (19/10/2026, decisión de Alberto; Generali = Okta «Autenticación por SMS»).
//
//   asegura apunta la petición del worker → cron de plataforma (cada minuto) → Telegram (force_reply, aviso catalogado
//   `correduria.tarificador-codigo-sms`) «Generali pide el código SMS que te acaba de llegar: respóndeme con el código» →
//   Alberto contesta (respuesta al aviso, `/sms 123456` o el número solo) → webhook → `entregarCodigoSmsAsegura` → asegura
//   lo SELLA para el worker (un uso, 10 min) → el bot lo escribe, marca «No volver a solicitar… 30 días» y verifica.
//
// Dos partes, como el resto de lectores del puerto: lo PURO (interpretar, componer, leer la respuesta; con test) y la RED.
// 🚨 El código NUNCA se loguea, ni se guarda, ni se repite en una respuesta. Solo se acepta de TELEGRAM_CHAT_ID (from y chat).
// 🚨 Un fallo del puerto NO es «no hay pendientes».
import { cabecerasPuerto } from './puerto-actor.ts'

export type PeticionCodigo = { id: string; ref: string; compania: string; ramo: string; caducaEn: string | null }

export type RespuestaPeticiones =
  | { estado: 'ok'; pendientes: PeticionCodigo[]; ilegibles: number }
  | { estado: 'sin_configurar' }
  | { estado: 'sin_esquema' }
  | { estado: 'error'; causa: string }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const REF = /^[0-9a-f]{8}$/
const cadena = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v.trim() : null)

/** PURO. La respuesta del puerto → peticiones, o un error CON causa. Una fila rara no desaparece: se cuenta. */
export function interpretarPeticionesCodigo(status: number, json: unknown): RespuestaPeticiones {
  if (status === 401 || status === 403) return { estado: 'error', causa: 'asegura rechaza el secreto (ASEGURA_OPERADOR_SECRET)' }
  if (status === 404) return { estado: 'error', causa: 'asegura aún no tiene /api/operador/tarificador/codigo-sms desplegado' }
  const o = (typeof json === 'object' && json !== null ? json : {}) as Record<string, unknown>
  if (o.estado === 'codigo_sms_sin_activar') return { estado: 'sin_esquema' }
  if (o.estado === 'sin_configurar') return { estado: 'sin_configurar' }
  if (o.estado === 'error') return { estado: 'error', causa: cadena(o.causa) ?? cadena(o.mensaje) ?? `HTTP ${status}` }
  if (status !== 200 || o.estado !== 'ok' || !Array.isArray(o.pendientes)) return { estado: 'error', causa: `respuesta ilegible (HTTP ${status})` }
  const pendientes: PeticionCodigo[] = []
  let ilegibles = 0
  for (const f of o.pendientes) {
    const r = (typeof f === 'object' && f !== null ? f : {}) as Record<string, unknown>
    const id = cadena(r.id)
    const ref = cadena(r.ref)
    const compania = cadena(r.compania)
    if (!id || !UUID.test(id) || !ref || !REF.test(ref) || !compania) { ilegibles++; continue }
    pendientes.push({ id, ref, compania, ramo: cadena(r.ramo) ?? '', caducaEn: cadena(r.caducaEn) })
  }
  return { estado: 'ok', pendientes, ilegibles }
}

const escapar = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const nombre = (c: string): string => (c ? c.charAt(0).toUpperCase() + c.slice(1) : 'El portal')

/** Lo que identifica el aviso cuando Alberto le contesta (Telegram devuelve el texto citado SIN el HTML). */
export const MARCA_AVISO_CODIGO = 'pide el código SMS que te acaba de llegar'

function horaMadrid(iso: string | null): string | null {
  const t = iso ? Date.parse(iso) : NaN
  if (!Number.isFinite(t)) return null
  return new Date(t).toLocaleTimeString('es-ES', { timeZone: 'Europe/Madrid', hour: '2-digit', minute: '2-digit' })
}

/** PURO. El Telegram (HTML) de UNA petición: compañía, ramo, ref corta y hora de caducidad. Nada del cliente ni del riesgo. */
export function componerAvisoCodigoSms(p: PeticionCodigo): string {
  const hora = horaMadrid(p.caducaEn)
  const detalle = [p.ramo ? `presupuesto de ${escapar(p.ramo)}` : null, `ref ${escapar(p.ref)}`, hora ? `vale hasta las ${hora}` : null].filter(Boolean).join(' · ')
  return `🔐 ${escapar(nombre(p.compania))} ${MARCA_AVISO_CODIGO}: respóndeme con el código\n<i>${detalle}</i>`
}

export type MensajeCodigo =
  | { tipo: 'no_es' }
  /** Parece una respuesta de código pero NO viene de Alberto: se descarta sin tocar nada (ni se reenvía a otro flujo). */
  | { tipo: 'ignorar' }
  | { tipo: 'invalido' }
  /** `forma`: `numero` = el número solo, sin responder a nada. Si no hay ninguna petición abierta, el webhook lo deja seguir
   *  su camino de siempre (puede ser un código postal para el asistente). */
  | { tipo: 'codigo'; ref: string | null; codigo: string; forma: 'respuesta' | 'comando' | 'numero' }

type MsgTelegram = { text?: unknown; from?: { id?: unknown }; chat?: { id?: unknown }; reply_to_message?: { text?: unknown } } | null | undefined

/**
 * PURO. ¿Este mensaje es un código SMS para el bot? Tres formas: respuesta al aviso (lleva la ref), `/sms 123456` (o
 * `/codigo`), o el número solo (4-8 dígitos). Solo de TELEGRAM_CHAT_ID (from Y chat); sin chat configurado, nadie.
 */
export function leerMensajeCodigoSms(msg: MsgTelegram, chatPermitido: string | undefined): MensajeCodigo {
  if (!msg || typeof msg.text !== 'string') return { tipo: 'no_es' }
  const texto = msg.text.trim()
  const citado = typeof msg.reply_to_message?.text === 'string' ? msg.reply_to_message.text : ''
  const esRespuesta = citado.includes(MARCA_AVISO_CODIGO)
  const comando = /^\/(?:sms|codigo|código)(?:@\w+)?(?:\s+(.*))?$/i.exec(texto)
  // El número solo cuenta si NO responde a otro mensaje (una respuesta a otra cosa es de ese flujo).
  const soloNumero = /^\d{4,8}$/.test(texto) && !msg.reply_to_message
  if (!esRespuesta && !comando && !soloNumero) return { tipo: 'no_es' }
  if (!chatPermitido || String(msg.from?.id ?? '') !== String(chatPermitido) || String(msg.chat?.id ?? '') !== String(chatPermitido)) {
    // Un número suelto de otro chat no es asunto de este flujo: que siga su camino (ia-rest y demás comparten el bot).
    return soloNumero && !esRespuesta && !comando ? { tipo: 'no_es' } : { tipo: 'ignorar' }
  }
  const candidato = comando ? (comando[1] ?? '').trim() : texto
  if (!/^\d{4,8}$/.test(candidato)) return { tipo: 'invalido' }
  const ref = esRespuesta ? (/\bref ([0-9a-f]{8})\b/.exec(citado)?.[1] ?? null) : null
  return { tipo: 'codigo', ref, codigo: candidato, forma: esRespuesta ? 'respuesta' : comando ? 'comando' : 'numero' }
}

export type ResultadoEntrega =
  | { estado: 'entregado'; compania: string }
  | { estado: 'sin_peticion' | 'caducada' | 'ya_respondida' | 'trabajo_cerrado' }
  | { estado: 'varias'; n: number }
  | { estado: 'error'; causa: string }

/** PURO. Respuesta del puerto a la entrega → desenlace. Nunca lleva el código. */
export function interpretarEntrega(status: number, json: unknown): ResultadoEntrega {
  const o = (typeof json === 'object' && json !== null ? json : {}) as Record<string, unknown>
  if (status === 200 && o.estado === 'entregado') return { estado: 'entregado', compania: cadena(o.compania) ?? '' }
  if (status === 200 && (o.estado === 'sin_peticion' || o.estado === 'caducada' || o.estado === 'ya_respondida' || o.estado === 'trabajo_cerrado')) return { estado: o.estado }
  if (status === 200 && o.estado === 'varias') return { estado: 'varias', n: typeof o.n === 'number' ? o.n : 2 }
  if (status === 401 || status === 403) return { estado: 'error', causa: 'asegura rechaza el secreto' }
  if (status === 404) return { estado: 'error', causa: 'asegura aún no tiene el relevo del código desplegado' }
  if (o.estado === 'codigo_sms_sin_activar') return { estado: 'error', causa: 'falta aplicar el SQL del relevo en asegura' }
  return { estado: 'error', causa: `HTTP ${status}` }
}

/** PURO. Lo que el bot contesta a Alberto (HTML). Nunca repite el código. */
export function textoTrasEntrega(r: ResultadoEntrega | { estado: 'invalido' }): string {
  switch (r.estado) {
    case 'entregado': return `✅ Código entregado al bot de ${escapar(nombre(r.compania))}: lo escribe, marca «no volver a pedir en 30 días» y sigue con el presupuesto.`
    case 'invalido': return '⚠️ Eso no es un código: respóndeme solo con los dígitos del SMS (de 4 a 8).'
    case 'sin_peticion': return 'ℹ️ Ahora mismo ningún bot está esperando un código SMS.'
    case 'varias': return `⚠️ Hay ${r.n} bots esperando código: responde deslizando sobre el aviso de cada uno.`
    case 'caducada': return '⌛ Ese código llega tarde: la petición caducó. Pulsa Reintentar en «Presupuestos de compañías».'
    case 'ya_respondida': return 'ℹ️ Ese bot ya tiene su código (solo se usa uno).'
    case 'trabajo_cerrado': return 'ℹ️ Ese bot ya terminó: el código no se ha usado.'
    case 'error': return `🛑 No he podido entregar el código (${escapar(r.causa)}). Mándalo otra vez en un momento.`
  }
}

// ─── Red ─────────────────────────────────────────────────────────────────────

function urlAsegura(): string {
  return (process.env.ASEGURA_URL || 'https://central-asegura.vercel.app').replace(/\/$/, '')
}

async function pedir(init: RequestInit): Promise<{ status: number; json: unknown } | null> {
  const secret = process.env.ASEGURA_OPERADOR_SECRET
  if (!secret) return null
  const res = await fetch(`${urlAsegura()}/api/operador/tarificador/codigo-sms`, {
    ...init,
    headers: { ...(init.headers ?? {}), ...(await cabecerasPuerto(secret)) },
    cache: 'no-store',
    signal: AbortSignal.timeout(15_000),
  })
  return { status: res.status, json: await res.json().catch(() => null) }
}

export async function leerPeticionesCodigoAsegura(): Promise<RespuestaPeticiones> {
  try {
    const r = await pedir({ method: 'GET' })
    if (r === null) return { estado: 'sin_configurar' }
    return interpretarPeticionesCodigo(r.status, r.json)
  } catch (e) {
    return { estado: 'error', causa: `no se pudo llegar a asegura (${e instanceof Error ? e.name : 'error'})` }
  }
}

/** Marca las peticiones avisadas (idempotente al otro lado). `true` solo con `{estado:'ok'}`. */
export async function marcarCodigosAvisados(ids: string[]): Promise<boolean> {
  if (ids.length === 0) return true
  try {
    const r = await pedir({ method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ accion: 'avisados', ids }) })
    const o = (r && typeof r.json === 'object' && r.json !== null ? r.json : {}) as Record<string, unknown>
    return r !== null && r.status === 200 && o.estado === 'ok'
  } catch {
    return false
  }
}

/** Entrega la respuesta de Alberto. El código solo viaja en el CUERPO (nunca en la URL) y no se loguea ni en el error. */
export async function entregarCodigoSmsAsegura(ref: string | null, codigo: string): Promise<ResultadoEntrega> {
  try {
    const r = await pedir({ method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ accion: 'entregar', ref, codigo }) })
    if (r === null) return { estado: 'error', causa: 'puerto sin configurar' }
    return interpretarEntrega(r.status, r.json)
  } catch (e) {
    return { estado: 'error', causa: `asegura no responde (${e instanceof Error ? e.name : 'error'})` }
  }
}
