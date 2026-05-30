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
