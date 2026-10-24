import { NextResponse } from 'next/server'

import { responderAplicarRenta } from '@/lib/patrimonio/contratos-api'
import { puertosContratos } from '@/lib/patrimonio/contratos-bd'
import { rateLimit } from '@/lib/rate-limit'
import { requireIdentidad } from '@/lib/session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * `POST /api/patrimonio/contratos/<id>/renta` — APLICA la actualización de renta propuesta (fila nueva, append-only).
 * 🚨 El servidor RECALCULA la propuesta (contrato + tabla de índices); el cuerpo `{desde, rentaNuevaCent, indice, periodo}`
 * solo confirma lo que la persona vio: si no coincide, 409. Sin cláusula, índice distinto o sin índice: 409 y no se
 * escribe nada. Contrato ajeno o sin nivel Total: 404.
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  let identidad
  try {
    identidad = await requireIdentidad()
  } catch {
    return NextResponse.json({ error: 'sin_sesion' }, { status: 401 })
  }
  const tope = rateLimit(`patrimonio-renta:${identidad.id}`, 30, 60 * 60 * 1000)
  if (!tope.allowed) {
    return NextResponse.json({ error: 'demasiadas_peticiones' }, { status: 429, headers: { 'retry-after': String(tope.retryAfter ?? 60) } })
  }
  const { id } = await ctx.params
  const cuerpo = await req.json().catch(() => null)
  const r = await responderAplicarRenta(puertosContratos(identidad.id), id, cuerpo)
  return NextResponse.json(r.body, { status: r.status })
}
