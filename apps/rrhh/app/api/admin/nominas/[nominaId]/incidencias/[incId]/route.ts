import { NextResponse } from 'next/server'
import { getSesion, AuthError } from '@/lib/tenant'
import { deleteIncidencia } from '@/lib/nominas'

export async function DELETE(_req: Request, { params }: { params: Promise<{ incId: string }> }) {
  try {
    const { empresa_id } = await getSesion()
    const { incId } = await params
    await deleteIncidencia(empresa_id, incId)
    return NextResponse.json({ ok: true })
  } catch (e) {
    if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: 401 })
    if (e instanceof Error && e.message.includes('confirmada')) return NextResponse.json({ error: e.message }, { status: 409 })
    if (e instanceof Error && e.message.includes('no encontrada')) return NextResponse.json({ error: e.message }, { status: 404 })
    throw e
  }
}
