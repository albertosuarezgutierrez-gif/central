// Sesión por PIN: cookie con el JSON firmado (HMAC) de core-identity/pin. Válido en edge (Web Crypto).
import { firmarSesionPin, verificarSesionPin } from '@central/core-identity/pin'

export const COOKIE_NAME = 'taller_session'
export const SECRETO = 'TALLER_SESSION_SECRET'
export const DURACION_MS = 12 * 60 * 60 * 1000

export const COOKIE_OPTS = {
  httpOnly: true,
  secure: true,
  sameSite: 'lax',
  path: '/',
  maxAge: DURACION_MS / 1000,
} as const

export type SesionTaller = { tallerId: string; usuarioId: string; rol: string; exp: number }

const aB64 = (s: string) => btoa(String.fromCharCode(...new TextEncoder().encode(s)))
const deB64 = (s: string) => new TextDecoder().decode(Uint8Array.from(atob(s), c => c.charCodeAt(0)))

export async function emitirCookie(s: Omit<SesionTaller, 'exp'>, ahora: Date): Promise<string> {
  const firmada = await firmarSesionPin({ ...s, exp: ahora.getTime() + DURACION_MS }, SECRETO)
  return aB64(JSON.stringify(firmada))
}

/** null si falta, está manipulada o caducada (fail-closed). */
export async function leerCookie(valor: string | undefined, ahora: Date): Promise<SesionTaller | null> {
  if (!valor) return null
  try {
    const o = JSON.parse(deB64(valor)) as Record<string, unknown>
    if (!(await verificarSesionPin(o, SECRETO))) return null
    if (typeof o.exp !== 'number' || o.exp <= ahora.getTime()) return null
    if (typeof o.tallerId !== 'string' || typeof o.usuarioId !== 'string' || typeof o.rol !== 'string') return null
    return { tallerId: o.tallerId, usuarioId: o.usuarioId, rol: o.rol, exp: o.exp }
  } catch {
    return null
  }
}
