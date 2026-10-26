import { NextResponse } from 'next/server'

import { responderHipoteca } from '@/lib/patrimonio/ofertas-api'
import { puertosOfertas } from '@/lib/patrimonio/ofertas-bd'
import { rateLimit } from '@/lib/rate-limit'
import { SIN_ACCESO, puertaDeSesion } from '@/lib/puertas-portal'
import { requireIdentidad } from '@/lib/session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * `POST /api/patrimonio/inmuebles/[id]/hipoteca` — `{ valor: 'si' | 'no' | 'no_se' }`: ¿tiene hipoteca este inmueble? Es
 * una DECLARACIÓN del cliente (no pide nada a nadie ni avisa a la correduría). 🚨 El inmueble se busca DENTRO de
 * `accesosPatrimonio()`; ajeno o sin nivel Total → 404 (nunca 403).
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  let identidad
  try {
    identidad = await requireIdentidad()
  } catch {
    return NextResponse.json({ error: 'sin_sesion' }, { status: 401 })
  }
  if (!(await puertaDeSesion('patrimonio', 'escritura'))) return NextResponse.json(SIN_ACCESO, { status: 403 })
  const tope = rateLimit(`patrimonio-hipoteca:${identidad.id}`, 60, 60 * 60 * 1000)
  if (!tope.allowed) {
    return NextResponse.json({ error: 'demasiadas_peticiones' }, { status: 429, headers: { 'retry-after': String(tope.retryAfter ?? 60) } })
  }
  const { id } = await params
  const cuerpo = await req.json().catch(() => null)
  const r = await responderHipoteca(puertosOfertas(identidad.id), id, cuerpo)
  return NextResponse.json(r.body, { status: r.status })
}
