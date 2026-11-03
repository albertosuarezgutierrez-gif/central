import { NextResponse } from 'next/server'

import { responderConfirmarVolcado } from '@/lib/patrimonio/volcado-api'
import { puertosVolcado } from '@/lib/patrimonio/volcado-bd'
import { rateLimit } from '@/lib/rate-limit'
import { SIN_ACCESO, puertaDeSesion } from '@/lib/puertas-portal'
import { requireIdentidad } from '@/lib/session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * `POST /api/patrimonio/volcados/[id]/confirmar` — `{ confirmar: true, propuesta }`: crea de verdad lo que la propuesta
 * REVISADA marca como «nueva», en UNA transacción y con el titular del volcado. Sin `confirmar: true` no escribe nada.
 * Confirmar dos veces no duplica (409 `cerrado`). Ajeno → 404 (nunca 403).
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  let identidad
  try {
    identidad = await requireIdentidad()
  } catch {
    return NextResponse.json({ error: 'sin_sesion' }, { status: 401 })
  }
  if (!(await puertaDeSesion('patrimonio', 'escritura'))) return NextResponse.json(SIN_ACCESO, { status: 403 })
  const tope = rateLimit(`patrimonio-volcado-confirmar:${identidad.id}`, 20, 60 * 60 * 1000)
  if (!tope.allowed) {
    return NextResponse.json({ error: 'demasiadas_peticiones' }, { status: 429, headers: { 'retry-after': String(tope.retryAfter ?? 60) } })
  }
  const { id } = await params
  const cuerpo = await req.json().catch(() => null)
  const r = await responderConfirmarVolcado(puertosVolcado(identidad.id), id, cuerpo)
  return NextResponse.json(r.body, { status: r.status })
}
