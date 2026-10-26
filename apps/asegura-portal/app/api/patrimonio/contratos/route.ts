import { NextResponse } from 'next/server'

import { responderAltaContrato } from '@/lib/patrimonio/contratos-api'
import { puertosContratos } from '@/lib/patrimonio/contratos-bd'
import { rateLimit } from '@/lib/rate-limit'
import { SIN_ACCESO, puertaDeSesion } from '@/lib/puertas-portal'
import { requireIdentidad } from '@/lib/session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * `POST /api/patrimonio/contratos` — alta de un contrato de larga estancia en un inmueble (nivel Total).
 * 🚨 La identidad sale de la cookie; el `inmueble` del cuerpo se busca DENTRO de `accesosPatrimonio()`: ajeno o sin
 * nivel → 404 (nunca 403). El titular lo resuelve el servidor. Lógica en `lib/patrimonio/contratos-api.ts`.
 */
export async function POST(req: Request) {
  let identidad
  try {
    identidad = await requireIdentidad()
  } catch {
    return NextResponse.json({ error: 'sin_sesion' }, { status: 401 })
  }
  if (!(await puertaDeSesion('patrimonio', 'escritura'))) return NextResponse.json(SIN_ACCESO, { status: 403 })
  const tope = rateLimit(`patrimonio-contrato:${identidad.id}`, 30, 60 * 60 * 1000)
  if (!tope.allowed) {
    return NextResponse.json({ error: 'demasiadas_peticiones' }, { status: 429, headers: { 'retry-after': String(tope.retryAfter ?? 60) } })
  }
  const cuerpo = await req.json().catch(() => null)
  const r = await responderAltaContrato(puertosContratos(identidad.id), cuerpo)
  return NextResponse.json(r.body, { status: r.status })
}
