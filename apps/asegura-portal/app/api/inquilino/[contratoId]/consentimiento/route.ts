import { NextResponse } from 'next/server'

import { responderConsentimiento } from '@/lib/inquilino/inquilino-api'
import { puertosInquilino } from '@/lib/inquilino/inquilino-bd'
import { rateLimit } from '@/lib/rate-limit'
import { requireIdentidad } from '@/lib/session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * `POST /api/inquilino/<contrato>/consentimiento` `{ concedido, version }` — el consentimiento comercial PROPIO del inquilino, o su
 * retirada. Opcional, sin casilla premarcada. Un «sí» exige la versión ACTUAL del texto. Contrato que no es suyo: 404.
 */
export async function POST(req: Request, ctx: { params: Promise<{ contratoId: string }> }) {
  let identidad
  try {
    identidad = await requireIdentidad()
  } catch {
    return NextResponse.json({ error: 'sin_sesion' }, { status: 401 })
  }
  const tope = rateLimit(`inquilino-consentimiento:${identidad.id}`, 30, 60 * 60 * 1000)
  if (!tope.allowed) return NextResponse.json({ error: 'demasiadas_peticiones' }, { status: 429 })
  const { contratoId } = await ctx.params
  const cuerpo = await req.json().catch(() => null)
  const r = await responderConsentimiento(puertosInquilino(identidad.id), contratoId, cuerpo)
  return NextResponse.json(r.body, { status: r.status })
}
