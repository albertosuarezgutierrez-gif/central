import { NextResponse } from 'next/server'

import { responderDescartarVolcado } from '@/lib/patrimonio/volcado-api'
import { puertosVolcado } from '@/lib/patrimonio/volcado-bd'
import { SIN_ACCESO, puertaDeSesion } from '@/lib/puertas-portal'
import { requireIdentidad } from '@/lib/session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** `POST /api/patrimonio/volcados/[id]/descartar` — cierra el volcado sin crear nada (la BD vacía la propuesta). */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  let identidad
  try {
    identidad = await requireIdentidad()
  } catch {
    return NextResponse.json({ error: 'sin_sesion' }, { status: 401 })
  }
  if (!(await puertaDeSesion('patrimonio', 'escritura'))) return NextResponse.json(SIN_ACCESO, { status: 403 })
  const { id } = await params
  const r = await responderDescartarVolcado(puertosVolcado(identidad.id), id)
  return NextResponse.json(r.body, { status: r.status })
}
