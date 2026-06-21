import { createHmac, timingSafeEqual } from 'node:crypto'

// Solo se firman los campos relevantes para autorización: así
// nombre / restaurante_nombre / onboarding pueden cambiar sin romper la firma.
interface SesionFirmable {
  id?: string
  rol?: string
  restaurante_id?: string
  cuenta_id?: string
  camarero_id?: string
  seccion_id?: string | null
  puede_comandar?: boolean
  modulos_gestion?: string[]
  _sig?: string
}

function cadenaCanonica(s: SesionFirmable): string {
  return [
    'v1',
    s.id ?? '',
    s.rol ?? '',
    s.restaurante_id ?? '',
    s.cuenta_id ?? '',
    s.camarero_id ?? '',
    s.seccion_id ?? '',
    s.puede_comandar ? '1' : '0',
    Array.isArray(s.modulos_gestion) ? [...s.modulos_gestion].sort().join(',') : '',
  ].join('|')
}

function calcularSig(s: SesionFirmable): string {
  const secret = process.env.SESSION_SECRET
  if (!secret) throw new Error('SESSION_SECRET no configurado')
  return createHmac('sha256', secret).update(cadenaCanonica(s)).digest('hex')
}

/** Añade _sig al objeto de sesión antes de devolverlo en el login. */
export function firmarSesion<T extends SesionFirmable>(s: T): T & { _sig: string } {
  return { ...s, _sig: calcularSig(s) }
}

/** Verifica que la firma coincide y no ha sido manipulada. */
export function verificarSesion(s: SesionFirmable): boolean {
  if (!s?._sig || !process.env.SESSION_SECRET) return false
  let esperado: string
  try { esperado = calcularSig(s) } catch { return false }
  const a = Buffer.from(s._sig, 'utf8')
  const b = Buffer.from(esperado, 'utf8')
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

// ── Firma genérica de objeto completo (para portales con forma propia:
// contable_id, email, lista de restaurantes, módulos...) ──
function canonicalJSON(obj: unknown): string {
  const norm = (o: unknown): unknown => {
    if (Array.isArray(o)) return o.map(norm)
    if (o && typeof o === 'object') {
      const r: Record<string, unknown> = {}
      for (const k of Object.keys(o as Record<string, unknown>).filter(k => k !== '_sig').sort()) {
        r[k] = norm((o as Record<string, unknown>)[k])
      }
      return r
    }
    return o
  }
  return JSON.stringify(norm(obj))
}

function calcularSigObjeto(obj: unknown): string {
  const secret = process.env.SESSION_SECRET
  if (!secret) throw new Error('SESSION_SECRET no configurado')
  return createHmac('sha256', secret).update(canonicalJSON(obj)).digest('hex')
}

export function firmarObjeto<T extends Record<string, unknown>>(obj: T): T & { _sig: string } {
  return { ...obj, _sig: calcularSigObjeto(obj) }
}

export function verificarObjeto(obj: Record<string, unknown> | null | undefined): boolean {
  const sig = obj?._sig
  if (typeof sig !== 'string' || !process.env.SESSION_SECRET) return false
  let esperado: string
  try { esperado = calcularSigObjeto(obj) } catch { return false }
  const a = Buffer.from(sig, 'utf8')
  const b = Buffer.from(esperado, 'utf8')
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

// Regla de migración común: si trae firma, debe ser válida; si no, solo se
// acepta mientras SESSION_ENFORCE no esté en 'true'.
export function sesionAceptable(parsed: Record<string, unknown> | null | undefined, tipo: 'subset' | 'objeto'): boolean {
  if (!parsed) return false
  const enforce = process.env.SESSION_ENFORCE === 'true'
  if (parsed._sig) {
    return tipo === 'objeto' ? verificarObjeto(parsed) : verificarSesion(parsed)
  }
  return !enforce
}
