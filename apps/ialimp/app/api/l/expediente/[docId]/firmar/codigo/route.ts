import { NextResponse } from 'next/server'
import { getLimpiadoraSession } from '@/lib/limpiadora-auth'
import { solicitarCodigoFirma } from '@/lib/firma-limpiadora'

// POST — envía un código OTP al email de la limpiadora para firmar. { enviado, email_parcial? }.
export async function POST(_req: Request, { params }: { params: Promise<{ docId: string }> }) {
  const ses = await getLimpiadoraSession()
  if (!ses) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  try {
    const { docId } = await params
    const r = await solicitarCodigoFirma(ses.empresa_id, ses.limpiadora_id, docId)
    return NextResponse.json(r)
  } catch (e) {
    if (e instanceof Error && /no encontrado|no requiere/.test(e.message)) {
      return NextResponse.json({ error: e.message }, { status: 400 })
    }
    throw e
  }
}
