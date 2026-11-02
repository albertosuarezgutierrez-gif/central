import { timingSafeEqual } from 'node:crypto'
import type { NextRequest } from 'next/server'

// Autorización de crons y llamadas internas con CRON_SECRET. FAIL-CLOSED:
// sin CRON_SECRET configurado NO se autoriza nada (antes `Bearer ${undefined}`
// autenticaba con la cadena literal "Bearer undefined" y varios crons hacían
// `if (!secret) return true`). Comparación en tiempo constante.

function igualSeguro(a: string, b: string): boolean {
  const ba = Buffer.from(a, 'utf8')
  const bb = Buffer.from(b, 'utf8')
  if (ba.length !== bb.length) return false
  return timingSafeEqual(ba, bb)
}

/** true solo si CRON_SECRET existe y `valor` coincide exactamente con él. */
export function secretoCronValido(valor: string | null | undefined): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret || typeof valor !== 'string' || !valor) return false
  return igualSeguro(valor, secret)
}

/** true solo si la cabecera Authorization es `Bearer <CRON_SECRET>` (lo que manda el cron de Vercel). */
export function cronAutorizado(req: NextRequest | Request): boolean {
  const secret = process.env.CRON_SECRET
  const auth = req.headers.get('authorization')
  if (!secret || !auth) return false
  return igualSeguro(auth, `Bearer ${secret}`)
}
