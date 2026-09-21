import { NextRequest, NextResponse } from 'next/server'
import { exigirCorreduria } from '@/lib/correduria-acceso'
import { registrarContactoRenovacionAsegura } from '@/lib/renovaciones-asegura'

export const dynamic = 'force-dynamic'

// POST /api/correduria/renovaciones/contacto — registra que Alberto abrió el
// enlace de WhatsApp del aviso de renovación (el envío en sí lo hace su
// propio WhatsApp). `{ clienteId, polizaId, mensaje }`. El `actor` lo pone el
// servidor, nunca el cuerpo: mismo criterio que `/api/correduria/partes` y
// `/api/correduria/recaptacion/whatsapp`.
export async function POST(req: NextRequest) {
  const guarda = await exigirCorreduria()
  if (!guarda.ok) return guarda.respuesta
  const session = guarda.session
  const body = (await req.json().catch(() => null)) as
    | { clienteId?: string; polizaId?: string; mensaje?: string }
    | null
  if (!body?.clienteId || !body?.polizaId || !body?.mensaje) {
    return NextResponse.json({ estado: 'invalido', motivo: 'faltan_campos' }, { status: 422 })
  }
  const r = await registrarContactoRenovacionAsegura({
    clienteId: body.clienteId,
    polizaId: body.polizaId,
    mensaje: body.mensaje,
    actor: session.email,
  })
  return NextResponse.json(r)
}
