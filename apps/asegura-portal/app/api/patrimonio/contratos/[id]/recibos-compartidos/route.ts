import { NextResponse } from 'next/server'

import { responderCompartirRecibo, responderListarRecibos } from '@/lib/patrimonio/enlace-inquilino-api'
import { puertosEnlaceInquilino } from '@/lib/patrimonio/enlace-inquilino-bd'
import { rateLimit } from '@/lib/rate-limit'
import { requireIdentidad } from '@/lib/session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * `GET /api/patrimonio/contratos/<id>/recibos-compartidos` — los documentos de los inquilinos del contrato y cuáles se comparten.
 * `POST` `{ documentoId, compartir }` — marca o retira uno. Solo documentos DE un inquilino de ese contrato; Total; ajeno: 404.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  let identidad
  try {
    identidad = await requireIdentidad()
  } catch {
    return NextResponse.json({ error: 'sin_sesion' }, { status: 401 })
  }
  const { id } = await ctx.params
  const r = await responderListarRecibos(puertosEnlaceInquilino(identidad.id), id)
  return NextResponse.json(r.body, { status: r.status, headers: { 'cache-control': 'private, no-store' } })
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  let identidad
  try {
    identidad = await requireIdentidad()
  } catch {
    return NextResponse.json({ error: 'sin_sesion' }, { status: 401 })
  }
  const tope = rateLimit(`patrimonio-recibo-compartido:${identidad.id}`, 120, 60 * 60 * 1000)
  if (!tope.allowed) {
    return NextResponse.json({ error: 'demasiadas_peticiones' }, { status: 429, headers: { 'retry-after': String(tope.retryAfter ?? 60) } })
  }
  const { id } = await ctx.params
  const cuerpo = await req.json().catch(() => null)
  const r = await responderCompartirRecibo(puertosEnlaceInquilino(identidad.id), id, cuerpo)
  return NextResponse.json(r.body, { status: r.status })
}
