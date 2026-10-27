import { NextResponse } from 'next/server'

import { responderEvaluarVolcado, responderVerVolcado } from '@/lib/patrimonio/volcado-api'
import { puertosVolcado } from '@/lib/patrimonio/volcado-bd'
import { rateLimit } from '@/lib/rate-limit'
import { SIN_ACCESO, puertaDeSesion } from '@/lib/puertas-portal'
import { requireIdentidad } from '@/lib/session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * `GET /api/patrimonio/volcados/[id]` — la propuesta y su evaluación contra lo que ya tiene el titular.
 * `POST` — `{ inmuebles, contratos, gastos }` revisados: vuelve a evaluar SIN escribir nada.
 * 🚨 El volcado se busca DENTRO de los de ESTA identidad y de un titular autorizado con nivel Total: ajeno → 404.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  let identidad
  try {
    identidad = await requireIdentidad()
  } catch {
    return NextResponse.json({ error: 'sin_sesion' }, { status: 401 })
  }
  if (!(await puertaDeSesion('patrimonio', 'lectura'))) return NextResponse.json(SIN_ACCESO, { status: 403 })
  const { id } = await params
  const r = await responderVerVolcado(puertosVolcado(identidad.id), id)
  return NextResponse.json(r.body, { status: r.status })
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  let identidad
  try {
    identidad = await requireIdentidad()
  } catch {
    return NextResponse.json({ error: 'sin_sesion' }, { status: 401 })
  }
  if (!(await puertaDeSesion('patrimonio', 'escritura'))) return NextResponse.json(SIN_ACCESO, { status: 403 })
  const tope = rateLimit(`patrimonio-volcado-evaluar:${identidad.id}`, 300, 60 * 60 * 1000)
  if (!tope.allowed) {
    return NextResponse.json({ error: 'demasiadas_peticiones' }, { status: 429, headers: { 'retry-after': String(tope.retryAfter ?? 60) } })
  }
  const { id } = await params
  const cuerpo = await req.json().catch(() => null)
  const r = await responderEvaluarVolcado(puertosVolcado(identidad.id), id, cuerpo)
  return NextResponse.json(r.body, { status: r.status })
}
