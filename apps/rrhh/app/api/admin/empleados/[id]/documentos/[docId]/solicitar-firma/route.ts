import { NextResponse } from 'next/server'
import { getSesion, AuthError } from '@/lib/tenant'
import { solicitarFirma } from '@/lib/firma'
import { pushEmpleado } from '@/lib/push'

// POST — el responsable solicita la firma de un documento del empleado.
export async function POST(_req: Request, { params }: { params: Promise<{ id: string; docId: string }> }) {
  try {
    const { empresa_id } = await getSesion()
    const { id, docId } = await params
    await solicitarFirma(empresa_id, id, docId)
    await pushEmpleado(empresa_id, id, 'Tienes un documento para firmar', 'Entra en tu portal para revisarlo y firmarlo.')
    return NextResponse.json({ ok: true })
  } catch (e) {
    if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: 401 })
    if (e instanceof Error && /no encontrado|ya está firmado/.test(e.message)) {
      return NextResponse.json({ error: e.message }, { status: 400 })
    }
    throw e
  }
}
