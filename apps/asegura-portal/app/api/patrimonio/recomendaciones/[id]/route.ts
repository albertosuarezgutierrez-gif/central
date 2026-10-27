import { NextResponse } from 'next/server'

import { responderAnularRecomendacion } from '@/lib/patrimonio/recomendacion-api'
import { puertosRecomendacion } from '@/lib/patrimonio/recomendacion-bd'
import { rateLimit } from '@/lib/rate-limit'
import { SIN_ACCESO, puertaDeSesion } from '@/lib/puertas-portal'
import { requireIdentidad } from '@/lib/session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** `DELETE /api/patrimonio/recomendaciones/<id>` — anula una recomendación pendiente PROPIA (sello; no borra). Ajena: 404. */
export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  let identidad
  try {
    identidad = await requireIdentidad()
  } catch {
    return NextResponse.json({ error: 'sin_sesion' }, { status: 401 })
  }
  if (!(await puertaDeSesion('patrimonio', 'escritura'))) return NextResponse.json(SIN_ACCESO, { status: 403 })
  const tope = rateLimit(`patrimonio-recomendacion-anular:${identidad.id}`, 60, 60 * 60 * 1000)
  if (!tope.allowed) {
    return NextResponse.json({ error: 'demasiadas_peticiones' }, { status: 429, headers: { 'retry-after': String(tope.retryAfter ?? 60) } })
  }
  const { id } = await ctx.params
  const r = await responderAnularRecomendacion(puertosRecomendacion(identidad.id), id)
  return NextResponse.json(r.body, { status: r.status })
}
