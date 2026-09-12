import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { enviarEmailRecaptacionAsegura } from '@/lib/recaptacion-asegura'

export const dynamic = 'force-dynamic'

// POST /api/correduria/recaptacion/email — envía de verdad el email de
// recaptación (Resend, con tracking). `{ clienteId, polizaId, email, asunto,
// texto }`. El `actor` lo pone el servidor, nunca el cuerpo.
export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const body = (await req.json().catch(() => null)) as
    | { clienteId?: string; polizaId?: string; email?: string; asunto?: string; texto?: string }
    | null
  if (!body?.clienteId || !body?.polizaId || !body?.email || !body?.asunto || !body?.texto) {
    return NextResponse.json({ estado: 'invalido', motivo: 'faltan_campos' }, { status: 422 })
  }
  const r = await enviarEmailRecaptacionAsegura({
    clienteId: body.clienteId,
    polizaId: body.polizaId,
    email: body.email,
    asunto: body.asunto,
    texto: body.texto,
    actor: session.email,
  })
  return NextResponse.json(r)
}
