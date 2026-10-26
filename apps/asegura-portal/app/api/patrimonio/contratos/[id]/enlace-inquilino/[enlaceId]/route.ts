import { NextResponse } from 'next/server'

import { responderRetirarEnlace } from '@/lib/patrimonio/enlace-inquilino-api'
import { puertosEnlaceInquilino } from '@/lib/patrimonio/enlace-inquilino-bd'
import { rateLimit } from '@/lib/rate-limit'
import { SIN_ACCESO, puertaDeSesion } from '@/lib/puertas-portal'
import { requireIdentidad } from '@/lib/session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * `DELETE /api/patrimonio/contratos/<id>/enlace-inquilino/<enlaceId>` — el propietario ANULA el enlace y, si el inquilino ya
 * entró, REVOCA su acceso. No borra nada (sellos). Ajeno: 404.
 */
export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string; enlaceId: string }> }) {
  let identidad
  try {
    identidad = await requireIdentidad()
  } catch {
    return NextResponse.json({ error: 'sin_sesion' }, { status: 401 })
  }
  if (!(await puertaDeSesion('patrimonio', 'escritura'))) return NextResponse.json(SIN_ACCESO, { status: 403 })
  const tope = rateLimit(`patrimonio-enlace-inquilino-retirar:${identidad.id}`, 60, 60 * 60 * 1000)
  if (!tope.allowed) {
    return NextResponse.json({ error: 'demasiadas_peticiones' }, { status: 429, headers: { 'retry-after': String(tope.retryAfter ?? 60) } })
  }
  const { id, enlaceId } = await ctx.params
  const r = await responderRetirarEnlace(puertosEnlaceInquilino(identidad.id), id, enlaceId)
  return NextResponse.json(r.body, { status: r.status })
}
