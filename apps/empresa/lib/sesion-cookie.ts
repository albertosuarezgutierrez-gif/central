// Sesión de «Mi empresa»: cookie host-only `__Host-empresa_session` (HMAC de @central/core-identity/pin; válida en edge).
// 🚨 NUNCA en `.grupoasegura.es`: el prefijo `__Host-` obliga a Secure, Path=/ y SIN Domain (no la ve ninguna otra app).
// La FIRMA solo dice «la emitimos nosotros»; la VIGENCIA (persona con la misma versión de sesión y miembro activo de la cuenta
// elegida) se revalida en BD en cada petición (lib/contexto.ts). «Salir» sube la versión y corta todas las copias.
import { firmarSesionPin, verificarSesionPin } from '@central/core-identity/pin'
import { ENV_SESION } from './secretos.ts'

export const COOKIE_NAME = '__Host-empresa_session'
export const SESION_HORAS = 12

export const cookieOpts = () => ({ httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: SESION_HORAS * 3600 }) as const

/** p = persona · c = cuenta elegida (null = aún sin elegir) · sv = persona.sesion_version al entrar. */
export type SesionEmpresa = { p: string; c: string | null; sv: number; exp: number }

const aB64 = (s: string) => btoa(String.fromCharCode(...new TextEncoder().encode(s)))
const deB64 = (s: string) => new TextDecoder().decode(Uint8Array.from(atob(s), (c) => c.charCodeAt(0)))
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function emitirCookie(s: Omit<SesionEmpresa, 'exp'>, ahora: Date, exp?: number): Promise<string> {
  const firmada = await firmarSesionPin({ p: s.p, c: s.c, sv: s.sv, exp: exp ?? ahora.getTime() + SESION_HORAS * 3_600_000 }, ENV_SESION)
  return aB64(JSON.stringify(firmada))
}

/** null si falta, está manipulada, caducada o mal formada (fail-closed). */
export async function leerCookie(valor: string | undefined, ahora: Date): Promise<SesionEmpresa | null> {
  if (!valor) return null
  try {
    const o = JSON.parse(deB64(valor)) as Record<string, unknown>
    if (!(await verificarSesionPin(o, ENV_SESION))) return null
    if (typeof o.exp !== 'number' || o.exp <= ahora.getTime()) return null
    if (typeof o.p !== 'string' || !UUID.test(o.p)) return null
    if (o.c !== null && (typeof o.c !== 'string' || !UUID.test(o.c))) return null
    if (typeof o.sv !== 'number' || !Number.isInteger(o.sv) || o.sv < 0) return null
    return { p: o.p, c: o.c as string | null, sv: o.sv, exp: o.exp }
  } catch {
    return null
  }
}
