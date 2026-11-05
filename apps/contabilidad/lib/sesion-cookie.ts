// Sesión: cookie con el JSON firmado (HMAC) de @central/core-identity/pin. Válida en edge (Web Crypto): la usa el middleware.
// La FIRMA solo dice «esto lo emitimos nosotros»; la VIGENCIA (usuario activo, misma versión de sesión, vínculo con la empresa)
// se revalida en BD en cada petición (`lib/contexto.ts` → `contabilidad.sesion_vigente`). Revocar a un gestor corta de inmediato.
import { firmarSesionPin, verificarSesionPin } from '@central/core-identity/pin'

export const COOKIE_NAME = 'contabilidad_session'
export const SECRETO = 'CONTABILIDAD_SESSION_SECRET'
/** Duración absoluta de la sesión. */
export const SESION_HORAS = 12

export const cookieOpts = () => ({ httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: SESION_HORAS * 3600 }) as const

/** `e` = empresa elegida (null = aún en el selector). `sv` = `usuarios.sesion_version` al entrar. */
export type SesionContable = { u: string; e: string | null; sv: number; exp: number }

const aB64 = (s: string) => btoa(String.fromCharCode(...new TextEncoder().encode(s)))
const deB64 = (s: string) => new TextDecoder().decode(Uint8Array.from(atob(s), (c) => c.charCodeAt(0)))
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function emitirCookie(s: Omit<SesionContable, 'exp'>, ahora: Date, exp?: number): Promise<string> {
  const firmada = await firmarSesionPin({ u: s.u, e: s.e, sv: s.sv, exp: exp ?? ahora.getTime() + SESION_HORAS * 3_600_000 }, SECRETO)
  return aB64(JSON.stringify(firmada))
}

/** null si falta, está manipulada, caducada o mal formada (fail-closed). */
export async function leerCookie(valor: string | undefined, ahora: Date): Promise<SesionContable | null> {
  if (!valor) return null
  try {
    const o = JSON.parse(deB64(valor)) as Record<string, unknown>
    if (!(await verificarSesionPin(o, SECRETO))) return null
    if (typeof o.exp !== 'number' || o.exp <= ahora.getTime()) return null
    if (typeof o.u !== 'string' || !UUID.test(o.u)) return null
    if (o.e !== null && (typeof o.e !== 'string' || !UUID.test(o.e))) return null
    if (typeof o.sv !== 'number' || !Number.isInteger(o.sv) || o.sv < 0) return null
    return { u: o.u, e: o.e as string | null, sv: o.sv, exp: o.exp }
  } catch {
    return null
  }
}
