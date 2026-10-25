import { NextResponse } from 'next/server'

import { responderMapear, responderVer } from '@/lib/patrimonio/importacion-api'
import { puertosImportacion } from '@/lib/patrimonio/importacion-bd'
import { rateLimit } from '@/lib/rate-limit'
import { requireIdentidad } from '@/lib/session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * `GET /api/patrimonio/importaciones/[id]` — la propuesta: columnas, vista previa fila a fila con sus errores y el resumen.
 * `PATCH` — `{ tipo?, columnas: {campo: índice|null}, usoPorDefecto? }`: corrige el mapeo y recalcula la vista previa.
 *
 * 🚨 La importación se busca DENTRO de las de ESTA identidad y de un titular autorizado con nivel Total: ajena → 404.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  let identidad
  try {
    identidad = await requireIdentidad()
  } catch {
    return NextResponse.json({ error: 'sin_sesion' }, { status: 401 })
  }
  const { id } = await params
  const r = await responderVer(puertosImportacion(identidad.id), id)
  return NextResponse.json(r.body, { status: r.status })
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  let identidad
  try {
    identidad = await requireIdentidad()
  } catch {
    return NextResponse.json({ error: 'sin_sesion' }, { status: 401 })
  }
  const tope = rateLimit(`patrimonio-importar-mapeo:${identidad.id}`, 120, 60 * 60 * 1000)
  if (!tope.allowed) {
    return NextResponse.json({ error: 'demasiadas_peticiones' }, { status: 429, headers: { 'retry-after': String(tope.retryAfter ?? 60) } })
  }
  const { id } = await params
  const cuerpo = await req.json().catch(() => null)
  const r = await responderMapear(puertosImportacion(identidad.id), id, cuerpo)
  return NextResponse.json(r.body, { status: r.status })
}
