import { NextResponse } from 'next/server'
import { getSesion, AuthError } from '@/lib/tenant'
import { cambiarVisibilidadDocumento } from '@/lib/documental'

/**
 * PATCH { visible: boolean } — el responsable muestra u oculta un documento al empleado (migración 0029).
 * Ocultar exige que no tenga firma y que no sea una nómina. Scope: empresa de la sesión + empleado de la URL.
 */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string; docId: string }> }) {
  try {
    const { empresa_id } = await getSesion()
    const { id, docId } = await params
    const b = await req.json().catch(() => ({}))
    if (typeof b?.visible !== 'boolean') return NextResponse.json({ error: 'Indica si el documento es visible (true/false)' }, { status: 400 })
    await cambiarVisibilidadDocumento(empresa_id, id, docId, b.visible)
    return NextResponse.json({ ok: true, visible: b.visible })
  } catch (e) {
    if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: 401 })
    if (e instanceof Error && e.message.includes('no encontrado')) return NextResponse.json({ error: e.message }, { status: 404 })
    if (e instanceof Error && /debe ser visible|nóminas/.test(e.message)) return NextResponse.json({ error: e.message }, { status: 400 })
    throw e
  }
}
