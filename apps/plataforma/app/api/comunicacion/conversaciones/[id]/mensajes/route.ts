import { NextRequest, NextResponse } from 'next/server'
import { requireSession } from '@/lib/session'
import { enviarMensaje } from '@/lib/comunicacion'
import { z } from 'zod'

const Crear = z.object({ cuerpo: z.string().min(1) })

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const s = await requireSession().catch(() => null)
  if (!s) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const { id } = await params
  const b = Crear.safeParse(await req.json().catch(() => null))
  if (!b.success) return NextResponse.json({ error: 'Datos inválidos' }, { status: 400 })
  const msg = await enviarMensaje(s.id, id, b.data.cuerpo)
  if (!msg) return NextResponse.json({ error: 'No encontrada' }, { status: 404 })
  return NextResponse.json(msg, { status: 201 })
}
