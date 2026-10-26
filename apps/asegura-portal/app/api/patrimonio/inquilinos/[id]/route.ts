import { NextResponse } from 'next/server'

import { responderPiiInquilino } from '@/lib/patrimonio/contratos-api'
import { puertosContratos } from '@/lib/patrimonio/contratos-bd'
import { rateLimit } from '@/lib/rate-limit'
import { SIN_ACCESO, puertaDeSesion } from '@/lib/puertas-portal'
import { requireIdentidad } from '@/lib/session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * `GET /api/patrimonio/inquilinos/<id>` — NIF, correo y teléfono del inquilino, descifrados por el PUENTE de
 * `apps/asegura`. Solo nivel Total (`ver_pii_inquilino`); ajeno o sin nivel: 404. Se pide bajo demanda («Ver datos»),
 * nunca al pintar la página, y sin caché.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  let identidad
  try {
    identidad = await requireIdentidad()
  } catch {
    return NextResponse.json({ error: 'sin_sesion' }, { status: 401 })
  }
  if (!(await puertaDeSesion('patrimonio', 'lectura'))) return NextResponse.json(SIN_ACCESO, { status: 403 })
  const tope = rateLimit(`patrimonio-inquilino-pii:${identidad.id}`, 60, 60 * 60 * 1000)
  if (!tope.allowed) {
    return NextResponse.json({ error: 'demasiadas_peticiones' }, { status: 429, headers: { 'retry-after': String(tope.retryAfter ?? 60) } })
  }
  const { id } = await ctx.params
  const r = await responderPiiInquilino(puertosContratos(identidad.id), id)
  return NextResponse.json(r.body, { status: r.status, headers: { 'cache-control': 'private, no-store' } })
}
