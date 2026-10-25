import { NextResponse } from 'next/server'

import { responderConfirmar } from '@/lib/patrimonio/importacion-api'
import { puertosImportacion } from '@/lib/patrimonio/importacion-bd'
import { rateLimit } from '@/lib/rate-limit'
import { requireIdentidad } from '@/lib/session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * `POST /api/patrimonio/importaciones/[id]/confirmar` — crea de verdad lo que la vista previa marca como «nueva», en UNA
 * transacción. Confirmar dos veces no duplica (la segunda es 409 `cerrada`); una fila con problema, repetida o que ya existe
 * no se crea. Ajena → 404 (nunca 403).
 */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  let identidad
  try {
    identidad = await requireIdentidad()
  } catch {
    return NextResponse.json({ error: 'sin_sesion' }, { status: 401 })
  }
  const tope = rateLimit(`patrimonio-importar-confirmar:${identidad.id}`, 20, 60 * 60 * 1000)
  if (!tope.allowed) {
    return NextResponse.json({ error: 'demasiadas_peticiones' }, { status: 429, headers: { 'retry-after': String(tope.retryAfter ?? 60) } })
  }
  const { id } = await params
  const r = await responderConfirmar(puertosImportacion(identidad.id), id)
  return NextResponse.json(r.body, { status: r.status })
}
