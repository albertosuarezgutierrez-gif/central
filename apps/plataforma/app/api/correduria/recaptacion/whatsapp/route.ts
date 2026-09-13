import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { enviarWhatsappRecaptacionAsegura } from '@/lib/recaptacion-asegura'

export const dynamic = 'force-dynamic'

// POST /api/correduria/recaptacion/whatsapp — registra que Alberto abrió el
// enlace de WhatsApp de un lead (el envío en sí lo hace su propio WhatsApp).
// `{ clienteId, polizaId, mensaje }`. El `actor` lo pone el servidor, nunca el
// cuerpo: mismo criterio que `/api/correduria/partes`.
export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const body = (await req.json().catch(() => null)) as
    | { clienteId?: string; polizaId?: string; mensaje?: string }
    | null
  if (!body?.clienteId || !body?.polizaId || !body?.mensaje) {
    return NextResponse.json({ estado: 'invalido', motivo: 'faltan_campos' }, { status: 422 })
  }
  const r = await enviarWhatsappRecaptacionAsegura({
    clienteId: body.clienteId,
    polizaId: body.polizaId,
    mensaje: body.mensaje,
    actor: session.email,
  })
  return NextResponse.json(r)
}
