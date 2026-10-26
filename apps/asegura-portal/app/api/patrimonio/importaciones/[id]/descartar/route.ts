import { NextResponse } from 'next/server'

import { responderDescartar } from '@/lib/patrimonio/importacion-api'
import { puertosImportacion } from '@/lib/patrimonio/importacion-bd'
import { requireIdentidad } from '@/lib/session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** `POST /api/patrimonio/importaciones/[id]/descartar` — cierra la propuesta sin crear nada (la BD vacía sus datos). */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  let identidad
  try {
    identidad = await requireIdentidad()
  } catch {
    return NextResponse.json({ error: 'sin_sesion' }, { status: 401 })
  }
  const { id } = await params
  const r = await responderDescartar(puertosImportacion(identidad.id), id)
  return NextResponse.json(r.body, { status: r.status })
}
