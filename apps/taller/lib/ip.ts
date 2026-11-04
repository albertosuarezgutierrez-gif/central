import { isIP } from 'node:net'

/** IP del cliente tras el proxy (primer valor de x-forwarded-for). Para guardar en columnas `inet`: null si no es una IP. */
export function ipDeCabecera(xff: string | null | undefined): string | null {
  const v = xff?.split(',')[0]?.trim()
  return v && isIP(v) ? v : null
}
