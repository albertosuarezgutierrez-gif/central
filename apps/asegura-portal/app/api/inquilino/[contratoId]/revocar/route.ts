import { NextResponse } from 'next/server'

import { responderRevocar } from '@/lib/inquilino/inquilino-api'
import { puertosInquilino } from '@/lib/inquilino/inquilino-bd'
import { rateLimit } from '@/lib/rate-limit'
import { requireIdentidad } from '@/lib/session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * `POST /api/inquilino/<contrato>/revocar` — el inquilino deja de ver este contrato (revocación suya). No borra nada; para volver
 * a entrar, el propietario tendrá que darle un enlace nuevo. Contrato que no es suyo: 404.
 */
export async function POST(_req: Request, ctx: { params: Promise<{ contratoId: string }> }) {
  let identidad
  try {
    identidad = await requireIdentidad()
  } catch {
    return NextResponse.json({ error: 'sin_sesion' }, { status: 401 })
  }
  const tope = rateLimit(`inquilino-revocar:${identidad.id}`, 20, 60 * 60 * 1000)
  if (!tope.allowed) return NextResponse.json({ error: 'demasiadas_peticiones' }, { status: 429 })
  const { contratoId } = await ctx.params
  const r = await responderRevocar(puertosInquilino(identidad.id), contratoId)
  return NextResponse.json(r.body, { status: r.status })
}
