import { NextResponse } from 'next/server'
import { getSesion, AuthError } from '@/lib/tenant'
import { borrarDocumento } from '@/lib/documental'

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string; docId: string }> }) {
  try {
    const { empresa_id } = await getSesion()
    const { id, docId } = await params
    await borrarDocumento(empresa_id, id, docId)
    return NextResponse.json({ ok: true })
  } catch (e) {
    if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: 401 })
    if (e instanceof Error && e.message.includes('no encontrado')) return NextResponse.json({ error: e.message }, { status: 404 })
    throw e
  }
}
