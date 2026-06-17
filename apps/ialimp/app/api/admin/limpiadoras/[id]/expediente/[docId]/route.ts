import { NextResponse } from 'next/server'
import { requireEmpresaId } from '@/lib/tenant'
import { solicitarFirma } from '@/lib/firma-limpiadora'
import { borrarDocumento } from '@/lib/expediente-limpiadora'

// POST — el gestor solicita la firma de un documento (estado_firma → 'pendiente').
export async function POST(_req: Request, { params }: { params: Promise<{ id: string; docId: string }> }) {
  try {
    const empresa_id = await requireEmpresaId()
    const { id, docId } = await params
    await solicitarFirma(empresa_id, id, docId)
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    if (/no encontrado|firmado/i.test(e.message)) return NextResponse.json({ error: e.message }, { status: 400 })
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

// DELETE — el gestor borra un documento del expediente.
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string; docId: string }> }) {
  try {
    const empresa_id = await requireEmpresaId()
    const { id, docId } = await params
    await borrarDocumento(empresa_id, id, docId)
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    if (/no encontrado/i.test(e.message)) return NextResponse.json({ error: e.message }, { status: 400 })
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
