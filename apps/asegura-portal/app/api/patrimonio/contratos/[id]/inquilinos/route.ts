import { NextResponse } from 'next/server'

import { responderAltaInquilino } from '@/lib/patrimonio/contratos-api'
import { puertosContratos } from '@/lib/patrimonio/contratos-bd'
import { rateLimit } from '@/lib/rate-limit'
import { requireIdentidad } from '@/lib/session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * `POST /api/patrimonio/contratos/<id>/inquilinos` — alta de un inquilino (o avalista) en un contrato (nivel Total).
 * 🚨 El NIF, correo y teléfono NO se guardan en esta app: van por el PUENTE a `apps/asegura`, que los cifra y vuelve a
 * comprobar el acceso desde el contrato. Contrato ajeno: 404. Puente sin montar: 503 `sin_puente` (≠ 502 fallo).
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  let identidad
  try {
    identidad = await requireIdentidad()
  } catch {
    return NextResponse.json({ error: 'sin_sesion' }, { status: 401 })
  }
  const tope = rateLimit(`patrimonio-inquilino:${identidad.id}`, 30, 60 * 60 * 1000)
  if (!tope.allowed) {
    return NextResponse.json({ error: 'demasiadas_peticiones' }, { status: 429, headers: { 'retry-after': String(tope.retryAfter ?? 60) } })
  }
  const { id } = await ctx.params
  const cuerpo = await req.json().catch(() => null)
  const r = await responderAltaInquilino(puertosContratos(identidad.id), id, cuerpo)
  return NextResponse.json(r.body, { status: r.status })
}
