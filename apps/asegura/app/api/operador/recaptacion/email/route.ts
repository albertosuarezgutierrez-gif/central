import { NextResponse } from 'next/server'
import { operadorAutorizado } from '@/lib/operador'
import { registrarErrorCartera } from '@/lib/error-cartera'
import { aseguraConfigurada, prismaAsegura } from '@/lib/asegura-db'
import { correduriaUnica } from '@/lib/cartera'
import { pulirConIA } from '@/lib/recaptacion-ia'
import { enviarEmailResend } from '@/lib/recaptacion-email'
import { Prisma } from '@/lib/generated/asegura-client'
import { remitenteCorreo } from '@central/module-seguros'

export const dynamic = 'force-dynamic'

// POST /api/operador/recaptacion/email — envía de verdad por Resend (con
// tracking de apertura/clic) y deja el registro en `recaptacion_envios` +
// `historial_interno`. `{ clienteId, polizaId, email, asunto, texto, actor? }`.
export async function POST(req: Request) {
  if (!operadorAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  try {
    if (!aseguraConfigurada()) return NextResponse.json({ estado: 'sin_configurar' }, { status: 503 })
    const correduria = await correduriaUnica()
    if (!correduria) return NextResponse.json({ estado: 'error', motivo: 'sin correduría' }, { status: 500 })

    const body = (await req.json().catch(() => null)) as
      | { clienteId?: string; polizaId?: string; email?: string; asunto?: string; texto?: string; actor?: string }
      | null
    if (!body?.clienteId || !body?.polizaId || !body?.email || !body?.asunto || !body?.texto) {
      return NextResponse.json({ estado: 'invalido', motivo: 'faltan_campos' }, { status: 422 })
    }

    const db = prismaAsegura()
    const cliente = await db.cliente.findFirst({
      where: { id: body.clienteId, correduriaId: correduria.id, mergedIntoClienteId: null },
      select: { id: true },
    })
    if (!cliente) return NextResponse.json({ estado: 'no_encontrado' }, { status: 404 })

    const textoFinal = await pulirConIA(body.texto)
    const html = `<div style="font-family:system-ui,sans-serif;max-width:480px;white-space:pre-line">${escaparHtml(textoFinal)}</div>`
    const from = remitenteCorreo(process.env.ASEGURA_MAIL_FROM)
    const resultado = await enviarEmailResend({ from, to: body.email, asunto: body.asunto, texto: textoFinal, html })
    if (!resultado.ok) {
      return NextResponse.json(
        { estado: 'error', motivo: resultado.motivo },
        { status: resultado.motivo === 'sin_api_key' ? 503 : 502 },
      )
    }

    const actor = body.actor?.trim() || 'plataforma'
    await db.$executeRaw(Prisma.sql`
      insert into recaptacion_envios (correduria_id, cliente_id, poliza_id, canal, estado, mensaje, resend_message_id, creado_por)
      values (${correduria.id}::uuid, ${body.clienteId}::uuid, ${body.polizaId}::uuid, 'email', 'enviado', ${textoFinal}, ${resultado.resendMessageId}, ${actor})
    `)
    try {
      await db.$executeRaw(Prisma.sql`
        insert into historial_interno (correduria_id, cliente_id, tipo, texto)
        values (${correduria.id}::uuid, ${body.clienteId}::uuid, cast('gestion' as tipo_historial_interno), ${'Recaptación: email enviado por ' + actor})
      `)
    } catch (e) {
      console.error('[operador/recaptacion/email] historial_interno no se pudo anotar:', e instanceof Error ? e.message : e)
    }

    return NextResponse.json({ estado: 'ok' })
  } catch (e) {
    return NextResponse.json({ estado: 'error', causa: registrarErrorCartera('operador/recaptacion/email', e) }, { status: 500 })
  }
}

function escaparHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
