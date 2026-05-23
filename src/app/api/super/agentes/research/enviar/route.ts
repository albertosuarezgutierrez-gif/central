export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getSession } from '@/lib/session'
import { sendEmail } from '@/lib/email'
import { tgAlert } from '@/lib/telegram'

export async function POST(req: NextRequest) {
  const session = getSession(req)
  if (!session || session.rol !== 'super_admin') {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
  }

  const supabase = createServerClient()
  const { lead_id, email_asunto, email_cuerpo } = await req.json()

  const { data: lead } = await supabase
    .from('leads')
    .select('*')
    .eq('id', lead_id)
    .single()

  if (!lead) return NextResponse.json({ error: 'Lead no encontrado' }, { status: 404 })
  if (!lead.email) return NextResponse.json({ error: 'El lead no tiene email' }, { status: 400 })

  const empresa = lead.empresa || lead.restaurante || lead.nombre

  // Enviar email via Resend
  const asunto = email_asunto || lead.email_asunto || `ia.rest para ${empresa}`
  const cuerpo = email_cuerpo || lead.email_draft || ''

  // Convertir texto plano a HTML básico
  const htmlCuerpo = cuerpo
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .split('\n').map((line: string) => `<p style="margin:0 0 10px;font-family:sans-serif;font-size:15px;color:#1a1714;line-height:1.6">${line || '&nbsp;'}</p>`).join('')

  const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:32px 20px;background:#f6f1e7;font-family:sans-serif">
  <div style="max-width:560px;margin:0 auto">
    <div style="margin-bottom:24px">
      <span style="font-family:serif;font-size:22px;font-weight:600;color:#14110e">ia.rest</span>
    </div>
    <div style="background:#fff;border-radius:12px;padding:32px;border:1px solid #d8cdb6">
      ${htmlCuerpo}
    </div>
    <div style="margin-top:20px;font-family:sans-serif;font-size:12px;color:#9c8e7e;text-align:center">
      ia.rest · <a href="https://www.iarest.es" style="color:#d9442b;text-decoration:none">www.iarest.es</a> · hola@iarest.es
    </div>
  </div>
</body>
</html>`

  try {
    await sendEmail({
      to: lead.email,
      subject: asunto,
      html,
      text: cuerpo,
      replyTo: 'hola@iarest.es',
    })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Error desconocido'
    return NextResponse.json({ error: `Error enviando email: ${msg}` }, { status: 500 })
  }

  // Actualizar estado
  const { data: current } = await supabase.from('leads').select('eventos').eq('id', lead_id).single()
  const eventos = Array.isArray(current?.eventos) ? current.eventos : []

  await supabase.from('leads').update({
    estado_pipeline: 'enviado',
    propuesta_enviada_at: new Date().toISOString(),
    email_asunto: asunto,
    email_draft: cuerpo,
    estado: 'contactado',
    eventos: [...eventos, {
      tipo: '📨',
      texto: `Propuesta enviada a ${lead.email}. Asunto: "${asunto}"`,
      fecha: new Date().toISOString().split('T')[0]
    }]
  }).eq('id', lead_id)

  tgAlert(
    `📨 Propuesta enviada\n<b>${empresa}</b>\n✉ ${lead.email}`,
    'info'
  )

  return NextResponse.json({ ok: true })
}
