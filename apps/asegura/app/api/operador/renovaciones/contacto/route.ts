import { NextResponse } from 'next/server'
import { operadorAutorizado } from '@/lib/operador'
import { registrarErrorCartera } from '@/lib/error-cartera'
import { aseguraConfigurada } from '@/lib/asegura-db'
import { correduriaUnica } from '@/lib/cartera'
import { registrarContactoRenovacion } from '@/lib/cartera-renovaciones-contacto'
import { auditado } from '@/lib/auditoria'

export const dynamic = 'force-dynamic'

// POST /api/operador/renovaciones/contacto — registra que Alberto pulsó el
// botón de WhatsApp del aviso de renovación (el envío en sí lo hace su propio
// WhatsApp: sin WABA no hay forma de mandarlo desde aquí). Mismo contrato que
// `/api/operador/recaptacion/whatsapp`: `{ clienteId, polizaId, mensaje, actor? }`.
export const POST = auditado(async (req: Request) => {
  if (!operadorAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  try {
    if (!aseguraConfigurada()) return NextResponse.json({ estado: 'sin_configurar' }, { status: 503 })
    const correduria = await correduriaUnica()
    if (!correduria) return NextResponse.json({ estado: 'error', motivo: 'sin correduría' }, { status: 500 })
    const body = (await req.json().catch(() => null)) as
      | { clienteId?: string; polizaId?: string; mensaje?: string; actor?: string }
      | null
    if (!body?.clienteId || !body?.polizaId || !body?.mensaje) {
      return NextResponse.json({ estado: 'invalido', motivo: 'faltan_campos' }, { status: 422 })
    }
    const r = await registrarContactoRenovacion(correduria.id, {
      clienteId: body.clienteId,
      polizaId: body.polizaId,
      mensaje: body.mensaje,
      actor: body.actor?.trim() || 'plataforma',
    })
    if (!r.ok) return NextResponse.json({ estado: 'error', motivo: r.motivo }, { status: 404 })
    return NextResponse.json({ estado: 'ok' })
  } catch (e) {
    return NextResponse.json({ estado: 'error', causa: registrarErrorCartera('operador/renovaciones/contacto', e) }, { status: 500 })
  }
})
