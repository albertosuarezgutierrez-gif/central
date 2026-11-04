// Sesión por PIN: cookie con el JSON firmado (HMAC) de core-identity/pin. Válido en edge (Web Crypto).
import { firmarSesionPin, verificarSesionPin } from '@central/core-identity/pin'

export const COOKIE_NAME = 'taller_session'
export const SECRETO = 'TALLER_SESSION_SECRET'

const MIN = 60_000
/** Reemisión deslizante de la cookie: como mucho una vez por minuto (evita escribir cookie en cada petición). */
export const RENOVAR_CADA_MS = MIN

/** Opciones de la cookie: la caducidad es la de la CONFIGURACIÓN del taller (sesión), nunca un literal. */
export const cookieOpts = (sesionMinutos: number) =>
  ({ httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: sesionMinutos * 60 }) as const

export type PoliticaSesion = { sesionMinutos: number; inactividadMinutos: number }

/** `exp` = fin absoluto de la sesión; `act` = última actividad; `ina` = minutos de inactividad permitidos (de la config del taller). */
/** `sv` = versión de sesión del usuario al entrar (0006): cambiar/resetear PIN o dar de baja la sube y esta cookie deja de valer. */
export type SesionTaller = { tallerId: string; usuarioId: string; rol: string; sv: number; exp: number; act: number; ina: number }

const aB64 = (s: string) => btoa(String.fromCharCode(...new TextEncoder().encode(s)))
const deB64 = (s: string) => new TextDecoder().decode(Uint8Array.from(atob(s), c => c.charCodeAt(0)))

export async function emitirCookie(s: Pick<SesionTaller, 'tallerId' | 'usuarioId' | 'rol' | 'sv'>, ahora: Date, pol: PoliticaSesion): Promise<string> {
  const firmada = await firmarSesionPin(
    { ...s, exp: ahora.getTime() + pol.sesionMinutos * MIN, act: ahora.getTime(), ina: pol.inactividadMinutos }, SECRETO)
  return aB64(JSON.stringify(firmada))
}

/** Misma sesión (mismo `exp`) con la actividad al día. */
export async function renovarCookie(s: SesionTaller, ahora: Date): Promise<string> {
  const { tallerId, usuarioId, rol, sv, exp, ina } = s
  return aB64(JSON.stringify(await firmarSesionPin({ tallerId, usuarioId, rol, sv, exp, act: ahora.getTime(), ina }, SECRETO)))
}

/** null si falta, está manipulada o caducada (fail-closed). */
export async function leerCookie(valor: string | undefined, ahora: Date): Promise<SesionTaller | null> {
  if (!valor) return null
  try {
    const o = JSON.parse(deB64(valor)) as Record<string, unknown>
    if (!(await verificarSesionPin(o, SECRETO))) return null
    if (typeof o.exp !== 'number' || o.exp <= ahora.getTime()) return null
    if (typeof o.act !== 'number' || typeof o.ina !== 'number' || !(o.ina > 0)) return null
    // Cierre por inactividad (configurable por el taller).
    if (ahora.getTime() - o.act >= o.ina * MIN) return null
    if (typeof o.tallerId !== 'string' || typeof o.usuarioId !== 'string' || typeof o.rol !== 'string') return null
    // Sin versión de sesión (cookie anterior a 0006) = no vale: fail-closed.
    if (typeof o.sv !== 'number' || !Number.isInteger(o.sv) || o.sv < 0) return null
    return { tallerId: o.tallerId, usuarioId: o.usuarioId, rol: o.rol, sv: o.sv, exp: o.exp, act: o.act, ina: o.ina }
  } catch {
    return null
  }
}
