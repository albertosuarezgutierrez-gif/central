import { NextResponse } from 'next/server'
import { getSesionEmpleado } from '@/lib/empleado-tenant'
import { AuthError } from '@/lib/tenant'
import { solicitarCodigoFirma } from '@/lib/firma'

// POST — envía un código OTP al email del empleado para firmar. { enviado, email_parcial? }.
export async function POST(_req: Request, { params }: { params: Promise<{ docId: string }> }) {
  try {
    const { empresa_id, empleado_id } = await getSesionEmpleado()
    const { docId } = await params
    const r = await solicitarCodigoFirma(empresa_id, empleado_id, docId)
    return NextResponse.json(r)
  } catch (e) {
    if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: 401 })
    if (e instanceof Error && /no encontrado|no requiere/.test(e.message)) {
      return NextResponse.json({ error: e.message }, { status: 400 })
    }
    throw e
  }
}
