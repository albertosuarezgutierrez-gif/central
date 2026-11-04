// CAUSA del error de un trabajo del tarificador (05/11/2026, revisión de arquitectura del 04/11 punto 4). PURO.
//
// `error.tipo` (contrato del worker: infra/portal/datos/…) dice QUIÉN falló; `error.codigo` dice POR QUÉ, con una lista
// CERRADA y estable para que el panel y la alarma agrupen sin leer el mensaje (que puede llevar datos personales).
// Se calcula en asegura (`marcarFallo`) a partir del tipo y del mensaje; el worker PUEDE proponer uno (`error.codigo`), pero
// nunca puede convertir en transitorio lo que asegura ve determinista (un guard, un OTP, un login, unos datos que faltan).
//
// REINTENTO (solo `modo = tarificar`): únicamente lo TRANSITORIO (`timeout`, `portal_caido`, `infra`), 2 reintentos como
// mucho (3 intentos en total), con espera de 10 y 30 min. Nunca `guard_emision`, `otp_captcha`, `datos_faltan` ni `login`:
// repetirlos es otro login con NUESTRA credencial y no arregla nada.
//
// 🚨 Un timeout de un LOCALIZADOR (`locator.click: Timeout …`) NO es `timeout`: es un control que no aparece o está
// deshabilitado («el portal no es como el adaptador cree», errores.ts del worker). Va a `otro` y no se reintenta.

import type { EstadoTrabajo } from '@central/module-tarificacion'

export const CODIGOS_ERROR = ['login', 'otp_captcha', 'guard_emision', 'sin_precio', 'timeout', 'portal_caido', 'datos_faltan', 'infra', 'otro'] as const
export type CodigoError = (typeof CODIGOS_ERROR)[number]

export const CODIGOS_REINTENTABLES: readonly CodigoError[] = Object.freeze(['timeout', 'portal_caido', 'infra'] as const)
/** Lo que asegura ve determinista: el código del worker no lo pisa. */
const DETERMINISTAS: readonly CodigoError[] = ['guard_emision', 'otp_captcha', 'login', 'datos_faltan']

/** Intentos totales de un trabajo de TARIFICAR: el primero + 2 reintentos de lo transitorio. Los demás modos siguen con 2. */
export const MAX_INTENTOS_TARIFICAR = 3
/** Espera antes del reintento n.º 1 y n.º 2 (minutos). */
export const ESPERA_REINTENTO_MIN = Object.freeze([10, 30] as const)

export function esCodigoError(v: unknown): v is CodigoError {
  return typeof v === 'string' && (CODIGOS_ERROR as readonly string[]).includes(v)
}

export function esCodigoReintentable(c: unknown): boolean {
  return esCodigoError(c) && CODIGOS_REINTENTABLES.includes(c)
}

/** ¿El trabajo es de tarificar (columna `modo` ausente/null = tarificar)? */
export function esModoTarificar(modo: string | null | undefined): boolean {
  return modo === null || modo === undefined || modo === 'tarificar'
}

/** Tope de intentos según el modo (lo usan la cola, el reencolado y el detector de duplicados). */
export function maxIntentosModo(modo: string | null | undefined, maxResto: number): number {
  return esModoTarificar(modo) ? MAX_INTENTOS_TARIFICAR : maxResto
}

const ANSI = /\u001b\[[0-9;]*m/g
const RE_GUARD = /guard_emision|patr[oó]n de emisi[oó]n/i
const RE_ELECCION = /requiere_eleccion_/
const RE_OTP = /requiere_verificacion_humana|captcha|\botp\b|segundo factor|c[oó]digo (?:sms|de verificaci[oó]n)|\bsms\b/i
const RE_NO_ADAPTADOR = /sin adaptador para|humo_no_soportado/
const RE_FLY = /^\s*fly:/
const RE_NAVEGADOR_CAIDO = /Target (?:page|browser|context).*closed|browser has been closed|Browser closed/i
const RE_PORTAL_CAIDO = /net::ERR_|ECONNRESET|ECONNREFUSED|ENOTFOUND|EAI_AGAIN|socket hang up|\bHTTP 5\d\d\b|\bstatus 5\d\d\b|Bad Gateway|Service Unavailable|Gateway Time-?out|portal_5xx/i
const RE_TIMEOUT = /\b(?:page|frame)\.(?:goto|reload|waitForNavigation|waitForURL|waitForLoadState|goBack|goForward): Timeout \d+ ?ms exceeded|Navigation timeout of \d+ ?ms exceeded|lease_vencido|timeout_navegacion/i
const RE_LOGIN = /\blogin\b|\bSSO\b|contrase[ñn]a|credencial|\bCRED_[A-Z0-9_]+/i
const RE_SIN_PRECIO = /sin precio|\bprecios?\b|sin ofertas|ninguna oferta/i

/**
 * Código derivado del tipo y del mensaje (sin el del worker). Orden: lo determinista por TIPO, lo transitorio por mensaje,
 * lo determinista por mensaje, el precio, el resto. Un tipo o mensaje que no se entiende → `otro` (nunca transitorio).
 */
export function codigoDerivado(tipo: unknown, mensaje: unknown): CodigoError {
  const m = typeof mensaje === 'string' ? mensaje.replace(ANSI, '') : ''
  if (RE_GUARD.test(m)) return 'guard_emision'
  // Un `emision` sin rastro del guard (emisión rechazada, caducada…) no es un bloqueo del guard; tampoco se reintenta nunca.
  if (tipo === 'emision') return /bloquead/i.test(m) ? 'guard_emision' : 'otro'
  if (tipo === 'eleccion' || RE_ELECCION.test(m)) return 'datos_faltan'
  if (tipo === 'captcha') return 'otp_captcha'
  if (tipo === 'credenciales') return 'login'
  if (tipo === 'datos') return RE_NO_ADAPTADOR.test(m) ? 'otro' : 'datos_faltan'
  if (tipo !== 'infra' && tipo !== 'portal') return 'otro'
  if (RE_FLY.test(m) || RE_NAVEGADOR_CAIDO.test(m)) return 'infra'
  if (RE_PORTAL_CAIDO.test(m)) return 'portal_caido'
  if (RE_TIMEOUT.test(m)) return 'timeout'
  if (RE_OTP.test(m)) return 'otp_captcha'
  if (RE_LOGIN.test(m)) return 'login'
  if (RE_SIN_PRECIO.test(m)) return 'sin_precio'
  return tipo === 'infra' ? 'infra' : 'otro'
}

/**
 * Código final. El del worker solo vale si es de la lista y si NO convierte en otra cosa lo que asegura ve determinista; y
 * uno transitorio del worker solo con un tipo que puede serlo (`infra`/`portal`).
 */
export function codigoDeError(e: { tipo: unknown; mensaje: unknown; codigo?: unknown }): CodigoError {
  const derivado = codigoDerivado(e.tipo, e.mensaje)
  if (DETERMINISTAS.includes(derivado)) return derivado
  if (!esCodigoError(e.codigo)) return derivado
  if (esCodigoReintentable(e.codigo) && e.tipo !== 'infra' && e.tipo !== 'portal') return derivado
  return e.codigo
}

/** Del jsonb `error` guardado: su `codigo` si es válido (y coherente), si no el derivado. `null` = no hay error. */
export function codigoDeErrorJson(e: unknown): CodigoError | null {
  if (!e || typeof e !== 'object' || Array.isArray(e)) return null
  const o = e as Record<string, unknown>
  if (o.tipo === undefined && o.mensaje === undefined && o.codigo === undefined) return null
  return codigoDeError({ tipo: o.tipo, mensaje: o.mensaje, codigo: o.codigo })
}

/**
 * Estado de un trabajo de TARIFICAR que falla. `base` = lo que dice la política común (`estadoTrasError`): `requiere_humano`
 * se respeta; con checkpoint de ATASCO se respeta la base (decide `atascoParaFallo`, que necesita `error_definitivo`); lo
 * transitorio se reintenta mientras `intentos` (los ya consumidos) < `MAX_INTENTOS_TARIFICAR`; lo demás, definitivo.
 */
export function estadoTarificarTrasFallo(f: { base: EstadoTrabajo; codigo: CodigoError; tipo: unknown; intentos: number; conAtasco: boolean }): EstadoTrabajo {
  if (f.base === 'requiere_humano') return f.base
  if (f.conAtasco) return f.base
  const transitorio = esCodigoReintentable(f.codigo) && (f.tipo === 'infra' || f.tipo === 'portal')
  if (transitorio && Number.isInteger(f.intentos) && f.intentos >= 1 && f.intentos < MAX_INTENTOS_TARIFICAR) return 'error_reintentable'
  return 'error_definitivo'
}

/** Hora a partir de la cual el barrido puede volver a poner en cola el reintento n.º `intentos` (1 → +10 min, 2 → +30 min). */
export function reintentarDesde(intentos: number, ahora: Date): string | null {
  if (!Number.isInteger(intentos) || intentos < 1) return null
  const min = ESPERA_REINTENTO_MIN[Math.min(intentos, ESPERA_REINTENTO_MIN.length) - 1]!
  return new Date(ahora.getTime() + min * 60_000).toISOString()
}

/** ¿Ya pasó la espera? Sin marca o ilegible → sí (el reintento no se congela por un dato dudoso). */
export function esperaCumplida(desde: unknown, ahora: Date): boolean {
  if (typeof desde !== 'string') return true
  const t = Date.parse(desde)
  return !Number.isFinite(t) || t <= ahora.getTime()
}

/** Patrón (para SQL) de un ISO escrito por `reintentarDesde`; lo que no case se trata como «sin espera». */
export const RE_SQL_REINTENTAR_DESDE = '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\\.[0-9]+)?Z$'
