import { NextResponse } from 'next/server'

import { responderCrearEnlace, responderListarEnlaces } from '@/lib/patrimonio/enlace-inquilino-api'
import { puertosEnlaceInquilino } from '@/lib/patrimonio/enlace-inquilino-bd'
import { rateLimit } from '@/lib/rate-limit'
import { requireIdentidad } from '@/lib/session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * `POST /api/patrimonio/contratos/<id>/enlace-inquilino` — el propietario (nivel Total) crea el ENLACE de su inquilino. Cuerpo:
 * `{ inquilinoId, contacto }`. Devuelve el token UNA vez (en BD solo queda el hash); el portal NO envía nada: lo copia o comparte
 * la persona. `GET` lista los enlaces del contrato (sin token). Contrato ajeno o sin nivel Total: 404.
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  let identidad
  try {
    identidad = await requireIdentidad()
  } catch {
    return NextResponse.json({ error: 'sin_sesion' }, { status: 401 })
  }
  const tope = rateLimit(`patrimonio-enlace-inquilino:${identidad.id}`, 30, 60 * 60 * 1000)
  if (!tope.allowed) {
    return NextResponse.json({ error: 'demasiadas_peticiones' }, { status: 429, headers: { 'retry-after': String(tope.retryAfter ?? 60) } })
  }
  const { id } = await ctx.params
  const cuerpo = await req.json().catch(() => null)
  const r = await responderCrearEnlace(puertosEnlaceInquilino(identidad.id), id, cuerpo)
  return NextResponse.json(r.body, { status: r.status, headers: { 'cache-control': 'private, no-store' } })
}

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  let identidad
  try {
    identidad = await requireIdentidad()
  } catch {
    return NextResponse.json({ error: 'sin_sesion' }, { status: 401 })
  }
  const { id } = await ctx.params
  const r = await responderListarEnlaces(puertosEnlaceInquilino(identidad.id), id)
  return NextResponse.json(r.body, { status: r.status, headers: { 'cache-control': 'private, no-store' } })
}
