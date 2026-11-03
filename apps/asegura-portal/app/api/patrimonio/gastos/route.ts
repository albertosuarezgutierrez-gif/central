import { NextResponse } from 'next/server'

import { responderResolverGasto } from '@/lib/patrimonio/gastos-resolver-api'
import { puertosResolverGasto } from '@/lib/patrimonio/gastos-resolver-bd'
import { rateLimit } from '@/lib/rate-limit'
import { SIN_ACCESO, puertaDeSesion } from '@/lib/puertas-portal'
import { requireIdentidad } from '@/lib/session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * `PATCH /api/patrimonio/gastos` (JSON: `titular`, `gasto`, `accion: confirmar|descartar`, `importeCent` opcional) —
 * resuelve un gasto `propuesto` generado por el cron (plantilla/derrama). Nivel Gestión o Total del titular; ajeno = 404.
 * La identidad sale SOLO de la cookie.
 */
export async function PATCH(req: Request) {
  let identidad
  try {
    identidad = await requireIdentidad()
  } catch {
    return NextResponse.json({ error: 'sin_sesion' }, { status: 401 })
  }
  if (!(await puertaDeSesion('patrimonio', 'escritura'))) return NextResponse.json(SIN_ACCESO, { status: 403 })
  const tope = rateLimit(`patrimonio-gasto-resolver:${identidad.id}`, 300, 60 * 60 * 1000)
  if (!tope.allowed) {
    return NextResponse.json({ error: 'demasiadas_peticiones' }, { status: 429, headers: { 'retry-after': String(tope.retryAfter ?? 60) } })
  }
  const cuerpo = await req.json().catch(() => null)
  const r = await responderResolverGasto(puertosResolverGasto(identidad.id), cuerpo)
  return NextResponse.json(r.body, { status: r.status })
}
