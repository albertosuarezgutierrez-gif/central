import { NextResponse } from 'next/server'
import { getSesion, AuthError } from '@/lib/tenant'
import { listarHilo, enviarMensaje } from '@/lib/chat'

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { empresa_id } = await getSesion()
    const { id } = await params
    return NextResponse.json({ mensajes: await listarHilo(empresa_id, id, 'gestor') })
  } catch (e) { if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: 401 }); throw e }
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { empresa_id } = await getSesion()
    const { id } = await params
    const { texto } = await req.json().catch(() => ({}))
    const mensaje = await enviarMensaje(empresa_id, id, 'gestor', String(texto ?? ''))
    return NextResponse.json({ mensaje }, { status: 201 })
  } catch (e) {
    if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: 401 })
    if (e instanceof Error && /vac|supera|no encontrado/.test(e.message)) return NextResponse.json({ error: e.message }, { status: 400 })
    throw e
  }
}
