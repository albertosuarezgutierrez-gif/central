import { NextResponse } from 'next/server'

import { responderNuevaUnidad } from '@/lib/patrimonio/edificio-api'
import { puertosEdificio } from '@/lib/patrimonio/edificio-bd'
import { rateLimit } from '@/lib/rate-limit'
import { SIN_ACCESO, puertaDeSesion } from '@/lib/puertas-portal'
import { requireIdentidad } from '@/lib/session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * `POST /api/patrimonio/inmuebles/[id]/unidades` — `{ alias, uso?, superficieM2? }`: añade una UNIDAD (piso, local) a un
 * EDIFICIO sin división horizontal (27/10/2026). 🚨 El edificio se busca DENTRO de `accesosPatrimonio()`; ajeno, no edificio
 * o sin nivel Total → 404 (nunca 403). La unidad nace en el titular del edificio (lo decide el servidor).
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  let identidad
  try {
    identidad = await requireIdentidad()
  } catch {
    return NextResponse.json({ error: 'sin_sesion' }, { status: 401 })
  }
  if (!(await puertaDeSesion('patrimonio', 'escritura'))) return NextResponse.json(SIN_ACCESO, { status: 403 })
  const tope = rateLimit(`patrimonio-unidad:${identidad.id}`, 60, 60 * 60 * 1000)
  if (!tope.allowed) {
    return NextResponse.json({ error: 'demasiadas_peticiones' }, { status: 429, headers: { 'retry-after': String(tope.retryAfter ?? 60) } })
  }
  const { id } = await params
  const cuerpo = await req.json().catch(() => null)
  const r = await responderNuevaUnidad(puertosEdificio(identidad.id), id, cuerpo)
  return NextResponse.json(r.body, { status: r.status })
}
