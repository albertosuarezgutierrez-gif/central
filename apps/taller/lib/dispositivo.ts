// El DISPOSITIVO recuerda el código del taller (cookie firmada). El código se resuelve a taller en CADA uso (`taller.taller_por_codigo`):
// si el dueño regenera el código, los dispositivos que recordaban el viejo dejan de resolver (así se revoca un móvil perdido).
// La cookie NO lleva el id del taller (nadie puede fabricarse una para otro taller) y está firmada con TALLER_SESSION_SECRET.
import { firmarSesionPin, verificarSesionPin } from '@central/core-identity/pin'
import { SECRETO } from './sesion-cookie.ts'
import { normalizarCodigoTaller } from './codigo-taller.ts'
import { esTallerId } from './rls.ts'

export const COOKIE_DISPOSITIVO = 'taller_dispositivo'
const UN_ANIO_S = 365 * 24 * 60 * 60

export const cookieDispositivoOpts = () => ({ httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: UN_ANIO_S }) as const

const aB64 = (s: string) => btoa(String.fromCharCode(...new TextEncoder().encode(s)))
const deB64 = (s: string) => new TextDecoder().decode(Uint8Array.from(atob(s), (c) => c.charCodeAt(0)))

export async function emitirCookieDispositivo(codigo: string): Promise<string> {
  return aB64(JSON.stringify(await firmarSesionPin({ codigo, tipo: 'dispositivo' }, SECRETO)))
}

/** Código recordado o null (ausente, manipulada, otra clase de cookie). */
export async function leerCookieDispositivo(valor: string | undefined): Promise<string | null> {
  if (!valor) return null
  try {
    const o = JSON.parse(deB64(valor)) as Record<string, unknown>
    if (o.tipo !== 'dispositivo' || !(await verificarSesionPin(o, SECRETO))) return null
    return normalizarCodigoTaller(o.codigo)
  } catch {
    return null
  }
}

/** Solo desarrollo: el taller fijo por entorno. NUNCA en producción (allí manda el código del dispositivo). */
export function tallerDeDesarrollo(env: Record<string, string | undefined> = process.env): string | null {
  if (env.NODE_ENV === 'production') return null
  const v = env.TALLER_PILOTO_ID?.trim()
  return esTallerId(v) ? v : null
}

/** Taller de este dispositivo: el del código recordado; sin cookie, solo en desarrollo el de TALLER_PILOTO_ID. Falla cerrado. */
export async function resolverTallerDelDispositivo(d: {
  cookie: string | undefined
  porCodigo(codigo: string): Promise<string | null>
  env?: Record<string, string | undefined>
}): Promise<string | null> {
  const codigo = await leerCookieDispositivo(d.cookie)
  if (codigo) {
    const id = await d.porCodigo(codigo).catch(() => null)
    return esTallerId(id) ? id : null
  }
  return tallerDeDesarrollo(d.env)
}
