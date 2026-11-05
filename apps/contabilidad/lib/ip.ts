import { isIP } from 'node:net'

/** IP del cliente tras el proxy (primer valor de x-forwarded-for). Sin IP válida → 'desconocida' (cuenta para el tope por IP). */
export function ipDeCabecera(xff: string | null | undefined): string {
  const v = xff?.split(',')[0]?.trim()
  return v && isIP(v) ? v : 'desconocida'
}
