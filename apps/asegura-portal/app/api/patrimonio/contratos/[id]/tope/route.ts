import { NextResponse } from 'next/server'

import { responderTopeRenta } from '@/lib/patrimonio/contratos-api'
import { puertosContratos } from '@/lib/patrimonio/contratos-bd'
import { rateLimit } from '@/lib/rate-limit'
import { requireIdentidad } from '@/lib/session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * `PUT /api/patrimonio/contratos/<id>/tope` — el cliente fija o quita el tope de actualización de la renta de SU
 * contrato (`{ modo: 'defecto' | 'propio' | 'sin_tope', pct? }`). Por defecto rige el catálogo por año de
 * `@central/module-patrimonio`. Solo nivel Total; contrato ajeno: 404 (nunca 403). No toca ninguna renta ya aplicada:
 * solo cambia la PRÓXIMA propuesta, que el servidor recalcula al aplicar.
 */
export async function PUT(req: Request, ctx: { params: Promise<{ id: string }> }) {
  let identidad
  try {
    identidad = await requireIdentidad()
  } catch {
    return NextResponse.json({ error: 'sin_sesion' }, { status: 401 })
  }
  const tope = rateLimit(`patrimonio-tope:${identidad.id}`, 30, 60 * 60 * 1000)
  if (!tope.allowed) {
    return NextResponse.json({ error: 'demasiadas_peticiones' }, { status: 429, headers: { 'retry-after': String(tope.retryAfter ?? 60) } })
  }
  const { id } = await ctx.params
  const cuerpo = await req.json().catch(() => null)
  const r = await responderTopeRenta(puertosContratos(identidad.id), id, cuerpo)
  return NextResponse.json(r.body, { status: r.status })
}
