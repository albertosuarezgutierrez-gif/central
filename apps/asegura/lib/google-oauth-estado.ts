/**
 * `state` del OAuth de Google Contacts, FIRMADO (HMAC-SHA256) y atado al navegador (05/10/2026).
 *
 * Anti-CSRF de verdad, no solo «un valor aleatorio»:
 *   1. Firma con `GOOGLE_CONTACTOS_STATE_SECRET` → nadie fabrica un `state` válido.
 *   2. Lleva un `nonce` que TAMBIÉN va en una cookie httpOnly del mismo navegador → un `state`
 *      robado no sirve desde otro navegador (el ataque clásico: colarle a Alberto la cuenta de
 *      Google de otro para que la cartera se sincronice ahí).
 *   3. Lleva la cuenta y la correduría de la sesión que lo pidió, y caduca en 10 minutos.
 *
 * Puro (sin red ni BD): el secreto se pasa como argumento. Lo prueba `google-oauth-estado.test.ts`.
 */
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

export const COOKIE_NONCE_GOOGLE = 'gc_oauth_nonce'
export const VIGENCIA_ESTADO_MS = 10 * 60 * 1000

export type DatosEstado = { correduriaId: string; cuentaId: string; nonce: string; caduca: number }

export type ResultadoEstado =
  | { ok: true; datos: DatosEstado }
  | { ok: false; motivo: 'mal_formado' | 'firma' | 'caducado' | 'nonce' | 'sesion' }

const b64 = (b: Buffer | string) => Buffer.from(b).toString('base64url')

function firma(cuerpo: string, secreto: string): string {
  return createHmac('sha256', secreto).update(`google-contactos-state:v1:${cuerpo}`).digest('base64url')
}

export function nuevoNonce(): string {
  return randomBytes(24).toString('base64url')
}

export function firmarEstado(d: Omit<DatosEstado, 'caduca'>, secreto: string, ahora: number = Date.now()): string {
  if (!secreto) throw new Error('Falta el secreto del state de Google Contacts')
  const cuerpo = b64(JSON.stringify({ c: d.correduriaId, u: d.cuentaId, n: d.nonce, e: ahora + VIGENCIA_ESTADO_MS }))
  return `${cuerpo}.${firma(cuerpo, secreto)}`
}

function iguales(a: string, b: string): boolean {
  const x = Buffer.from(a)
  const y = Buffer.from(b)
  return x.length === y.length && timingSafeEqual(x, y)
}

/**
 * Verifica el `state` que vuelve de Google contra el secreto, la cookie del navegador y, si la
 * hay, la sesión de asegura actual. Cualquier duda → `ok: false` (fail-closed).
 *
 * `sesion: null` (05/10/2026): el flujo que arranca desde plataforma con TICKET no tiene sesión de
 * asegura en el navegador. Entonces mandan el `state` firmado (correduría + cuenta de quien lo pidió,
 * por sesión o por ticket de un solo uso) y el nonce de la cookie httpOnly de ESTE navegador. Si hay
 * sesión, tiene que ser la misma cuenta y correduría que el `state`.
 */
export function verificarEstado(
  state: string | null,
  p: { secreto: string; nonceCookie: string | null | undefined; sesion: { cuentaId: string; correduriaId: string } | null; ahora?: number },
): ResultadoEstado {
  if (!state || !p.secreto) return { ok: false, motivo: 'mal_formado' }
  const partes = state.split('.')
  if (partes.length !== 2) return { ok: false, motivo: 'mal_formado' }
  const [cuerpo, sello] = partes
  if (!iguales(sello, firma(cuerpo, p.secreto))) return { ok: false, motivo: 'firma' }
  let d: { c?: unknown; u?: unknown; n?: unknown; e?: unknown }
  try {
    d = JSON.parse(Buffer.from(cuerpo, 'base64url').toString('utf8'))
  } catch {
    return { ok: false, motivo: 'mal_formado' }
  }
  if (typeof d.c !== 'string' || typeof d.u !== 'string' || typeof d.n !== 'string' || typeof d.e !== 'number') {
    return { ok: false, motivo: 'mal_formado' }
  }
  if ((p.ahora ?? Date.now()) > d.e) return { ok: false, motivo: 'caducado' }
  if (!p.nonceCookie || !iguales(d.n, p.nonceCookie)) return { ok: false, motivo: 'nonce' }
  if (p.sesion && (d.u !== p.sesion.cuentaId || d.c !== p.sesion.correduriaId)) return { ok: false, motivo: 'sesion' }
  return { ok: true, datos: { correduriaId: d.c, cuentaId: d.u, nonce: d.n, caduca: d.e } }
}
