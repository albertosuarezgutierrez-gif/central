export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { tgAnswerCallback, tgEditMessage, tgAlert } from '@/lib/telegram'
import { callAI, cleanJSON } from '@/lib/ai-client'
import { sendEmail } from '@/lib/email'
import { construirEmail } from '@/lib/crm-sevilla'

// Estado temporal para leads esperando cambio de foco
const pendingFoco: Map<string, { leadId: string; messageId: number }> = new Map()

export async function POST(req: NextRequest) {
  // Verificar token secreto en la URL
  const { searchParams } = new URL(req.url)
  const secret = searchParams.get('secret')
  if (secret !== process.env.TELEGRAM_WEBHOOK_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json()
  const supabase = createServerClient()

  // ── Callback de botón inline ────────────────────────────────────────────────
  if (body.callback_query) {
    const { id: callbackId, data, message, from } = body.callback_query
    const messageId = message?.message_id
    const chatId = (from?.id?.toString()) || process.env.TELEGRAM_CHAT_ID || ''
    // La autenticación ya la hace el secret de la URL (arriba). No exigimos además
    // que from.id == TELEGRAM_CHAT_ID: al reenviar desde instagram-callback el
    // from es el usuario que pulsa, que en un grupo no coincide con el chat.

    const [action, leadId] = data.split(':')

    if (action === 'propuesta_ok') {
      await tgAnswerCallback(callbackId, '⏳ Generando propuesta…')
      await tgEditMessage(messageId, message.text + '\n\n⏳ <i>Generando propuesta y email…</i>')

      // Generar propuesta + email en background
      generarPropuestaYEmail(leadId, supabase, messageId).catch(console.error)
    }

    if (action === 'propuesta_no') {
      await tgAnswerCallback(callbackId, 'Lead descartado')
      await tgEditMessage(messageId, message.text + '\n\n❌ <i>Lead descartado</i>')

      await supabase.from('leads').update({
        estado_pipeline: 'descartado',
        estado: 'perdido',
      }).eq('id', leadId)
    }

    if (action === 'propuesta_foco') {
      await tgAnswerCallback(callbackId, 'Escribe el nuevo foco')
      pendingFoco.set(chatId, { leadId, messageId })
      await tgEditMessage(
        messageId,
        message.text + '\n\n✏️ <i>Escríbeme el nuevo foco (ej: "enfócate en el control de costes")</i>'
      )
    }

    if (action === 'enviar_email') {
      await tgAnswerCallback(callbackId, '📨 Enviando…')
      await tgEditMessage(messageId, message.text.replace('¿Envío el email', '⏳ Enviando email'))

      const { data: lead } = await supabase.from('leads').select('*').eq('id', leadId).single()
      if (lead?.email && lead?.email_draft) {
        const empresa = lead.empresa || lead.restaurante || lead.nombre
        const html = emailToHtml(lead.email_draft as string)
        try {
          await sendEmail({ to: lead.email, subject: lead.email_asunto || `ia.rest para ${empresa}`, html, replyTo: 'hola@iarest.es' })

          const { data: c } = await supabase.from('leads').select('eventos').eq('id', leadId).single()
          const eventos = Array.isArray(c?.eventos) ? c.eventos : []
          await supabase.from('leads').update({
            estado_pipeline: 'enviado',
            propuesta_enviada_at: new Date().toISOString(),
            estado: 'contactado',
            eventos: [...eventos, { tipo: '📨', texto: `Email enviado a ${lead.email}`, fecha: new Date().toISOString().split('T')[0] }]
          }).eq('id', leadId)

          await tgEditMessage(messageId, `✅ <b>Email enviado a ${lead.email}</b>\n\nSigue el estado en <a href="https://www.iarest.es/super">/super →</a>`)
        } catch (e: unknown) {
          await tgEditMessage(messageId, `❌ Error enviando email: ${e instanceof Error ? e.message : 'desconocido'}`)
        }
      }
    }

    if (action === 'revisar_email') {
      await tgAnswerCallback(callbackId, 'Revísalo en /super')
      await tgEditMessage(messageId, message.text + '\n\n👆 <i>Revísalo y envíalo desde <a href="https://www.iarest.es/super">/super</a></i>')
    }

    // Aprobar y enviar el email frío de Sevilla (router de contacto). Reconstruye la
    // plantilla por vertical y envía desde hola@iarest.es vía Resend.
    if (action === 'enviar_sevilla') {
      await tgAnswerCallback(callbackId, '📨 Enviando…')
      await tgEditMessage(messageId, message.text + '\n\n⏳ <i>Enviando…</i>')
      try {
        const { data: lead } = await supabase
          .from('leads').select('id, nombre, email, tipo_negocio').eq('id', leadId).single()
        if (!lead?.email) {
          await tgEditMessage(messageId, message.text + '\n\n⚠️ <i>El lead no tiene email</i>')
          return NextResponse.json({ ok: true })
        }
        const jwt = (await import('jsonwebtoken')).default
        const { Resend } = await import('resend')
        const resend = new Resend(process.env.RESEND_API_KEY)
        const secret = process.env.JWT_SECRET_CRM || 'ia-rest-crm-2026'
        const jwtToken = jwt.sign({ lead_id: lead.id, exp: Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60 }, secret)
        const unsubToken = jwt.sign({ lead_id: lead.id }, secret)
        const unsubUrl = `https://www.iarest.es/api/leads/unsubscribe?token=${unsubToken}`
        const tpl = construirEmail(lead, jwtToken, unsubUrl)
        const r = await resend.emails.send({ from: 'Alberto <hola@iarest.es>', to: lead.email, subject: tpl.subject, html: tpl.html }) as { error?: unknown }
        if (r.error) throw new Error(typeof r.error === 'string' ? r.error : JSON.stringify(r.error))

        await supabase.from('leads_web_tracking')
          .update({ estado: 'enviado_dia1', mensaje_dia1_at: new Date().toISOString() })
          .eq('lead_id', lead.id).eq('estado', 'propuesto')
        await supabase.from('leads')
          .update({ estado: 'contactado', ultima_actividad_at: new Date().toISOString() })
          .eq('id', lead.id).eq('estado', 'nuevo')

        await tgEditMessage(messageId, `✅ <b>Email enviado a ${lead.email}</b>`)
      } catch (e: unknown) {
        await tgEditMessage(messageId, `❌ Error enviando email: ${e instanceof Error ? e.message : 'desconocido'}`)
      }
    }

    if (action === 'descartar_sevilla') {
      await tgAnswerCallback(callbackId, 'Descartado')
      await supabase.from('leads_web_tracking').update({ estado: 'descartado_email' }).eq('lead_id', leadId).eq('estado', 'propuesto')
      await tgEditMessage(messageId, message.text + '\n\n❌ <i>Descartado (no se envía)</i>')
    }

    if (action === 'ver_whatsapp') {
      // Primero DB + sendMessage, luego answerCallback (no bloquea si callback_id expira)
      try {
        const { data: leadRaw } = await supabase
          .from('leads')
          .select('empresa, restaurante, nombre, propuesta_slug')
          .eq('id', leadId)
          .single()

        const { data: waRow } = await supabase
          .from('leads')
          .select('whatsapp_draft')
          .eq('id', leadId)
          .single() as { data: { whatsapp_draft: string | null } | null }

        const empresa = leadRaw?.empresa || leadRaw?.restaurante || leadRaw?.nombre || leadId
        const waDraft = (waRow as Record<string, unknown>)?.whatsapp_draft as string || '⚠️ WhatsApp no generado. Pulsa Regenerar en CRM.'
        const propuestaUrl = leadRaw?.propuesta_slug
          ? `https://www.iarest.es/propuesta/${leadRaw.propuesta_slug}`
          : 'https://www.iarest.es/super'

        const tgToken = process.env.TELEGRAM_BOT_TOKEN
        const tgChat = process.env.TELEGRAM_CHAT_ID
        if (tgToken && tgChat) {
          await fetch(`https://api.telegram.org/bot${tgToken}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chat_id: tgChat,
              parse_mode: 'HTML',
              text: [
                `📱 <b>WhatsApp — ${empresa}</b>`,
                ``,
                `<code>${waDraft}</code>`,
                ``,
                `🔗 <a href="${propuestaUrl}">Propuesta →</a>`,
                `<i>Copia el texto y envíalo</i>`,
              ].join('\n'),
            }),
          })
        }
        await tgAnswerCallback(callbackId, '📱 WhatsApp enviado arriba ↑')
      } catch(e) {
        console.error('[ver_whatsapp]', e)
        await tgAnswerCallback(callbackId, 'Error al cargar').catch(() => {})
      }
    }

    if (action === 'qa_activar') {
      await tgAnswerCallback(callbackId, '✅ Activando…')
      const { data: p } = await supabase
        .from('qa_patrones_error')
        .update({ estado: 'activo', activado_at: new Date().toISOString() })
        .eq('id', leadId)
        .select('nombre')
        .single()
      await tgEditMessage(messageId, message.text + `\n\n✅ <b>Activado</b> — se ejecutará en el próximo QA`)
      console.log('[qa_activar] Patrón activado:', p?.nombre)
    }

    if (action === 'qa_descartar') {
      await tgAnswerCallback(callbackId, '❌ Descartado')
      await supabase.from('qa_patrones_error').update({ estado: 'inactivo' }).eq('id', leadId)
      await tgEditMessage(messageId, message.text + '\n\n❌ <i>Descartado</i>')
    }

    return NextResponse.json({ ok: true })
  }

  // ── Mensaje de texto (respuesta al cambio de foco) ──────────────────────────
  if (body.message?.text) {
    const chatId = body.message.from?.id?.toString()
    const text = body.message.text as string

    if (chatId !== process.env.TELEGRAM_CHAT_ID) {
      return NextResponse.json({ ok: true })
    }

    const focoData = pendingFoco.get(chatId)
    if (focoData && !text.startsWith('/')) {
      pendingFoco.delete(chatId)
      const { leadId, messageId } = focoData

      await tgAlert(`✏️ Regenerando con nuevo foco: "${text}"`, 'info')
      await tgEditMessage(messageId, `⏳ <i>Regenerando propuesta con foco: "${text}"…</i>`)

      generarPropuestaYEmail(leadId, supabase, messageId, text).catch(console.error)
    }
  }

  return NextResponse.json({ ok: true })
}

// ── Helper: texto plano → HTML email ─────────────────────────────────────────
function emailToHtml(texto: string): string {
  const lines = texto
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .split('\n')
    .map(l => `<p style="margin:0 0 10px;font-family:sans-serif;font-size:15px;color:#1a1714;line-height:1.6">${l || '&nbsp;'}</p>`)
    .join('')
  return `<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:32px 20px;background:#f6f1e7">
  <div style="max-width:560px;margin:0 auto">
    <div style="margin-bottom:24px"><span style="font-family:serif;font-size:22px;font-weight:600;color:#14110e">ia.rest</span></div>
    <div style="background:#fff;border-radius:12px;padding:32px;border:1px solid #d8cdb6">${lines}</div>
    <div style="margin-top:16px;font-size:12px;color:#9c8e7e;text-align:center">
      <a href="https://www.iarest.es" style="color:#d9442b;text-decoration:none">www.iarest.es</a> · hola@iarest.es
    </div>
  </div>
</body></html>`
}

async function generarPropuestaYEmail(
  leadId: string,
  supabase: ReturnType<typeof createServerClient>,
  messageId: number,
  nuevoFoco?: string
) {
  const { data: lead } = await supabase.from('leads').select('*').eq('id', leadId).single()
  if (!lead) return

  const empresa = lead.empresa || lead.restaurante || lead.nombre || 'Desconocido'
  const estudio = lead.estudio_completo as Record<string, unknown> || {}

  // Si hay nuevo foco, regenerar argumento principal
  let argumento = estudio.argumento_principal as string || ''
  if (nuevoFoco) {
    const focoRaw = await callAI(
      'Eres consultor de ventas. Responde SOLO con el nuevo argumento en 1 frase, sin comillas ni JSON.',
      `Lead: ${empresa}. Estudio: ${JSON.stringify(estudio).substring(0, 800)}. Nuevo foco solicitado: "${nuevoFoco}". Escribe UN argumento de venta poderoso con ese foco.`,
      200, 10000
    )
    argumento = focoRaw.trim()
    await supabase.from('leads').update({
      estudio_completo: { ...estudio, argumento_principal: argumento }
    }).eq('id', leadId)
  }

  // Generar email
  const emailRaw = await callAI(
    `Eres Alberto, fundador de ia.rest. Emails directos, cercanos, español de España. Sin "innovador/solución/potente". Solo JSON válido.`,
    `Email para: ${empresa}
Argumento: ${argumento}
Módulos críticos: ${(estudio.modulos_criticos as string[])?.join(', ')}
Pain points: ${(estudio.pain_points as string[])?.slice(0, 2).join(', ')}
MRR estimado: ${estudio.mrr_estimado}€/mes
TPV actual: ${estudio.tpv_actual || 'desconocido'}

Reglas:
- Máx 120 palabras en el cuerpo
- Menciona el negocio por nombre
- Referencia 1 pain point concreto
- Incluye literalmente __PROPUESTA_URL__ al final
- CTA: visita en su local, sin presión
- Firma: Alberto · ia.rest · hola@iarest.es

{"asunto":"asunto máx 60 chars","cuerpo":"texto con \\n. Incluir __PROPUESTA_URL__."}`,
    800, 20000
  )

  let emailData = {
    asunto: `ia.rest para ${empresa}`,
    cuerpo: `Hola,\n\n${argumento}\n\nPropuesta: __PROPUESTA_URL__\n\n¿Te parece si me paso un día por el local?\n\nAlberto · ia.rest · hola@iarest.es`
  }
  try { emailData = JSON.parse(cleanJSON(emailRaw)) } catch { /* usar default */ }

  // Generar slug si no existe
  let slug = lead.propuesta_slug as string
  if (!slug) {
    const slugBase = empresa.toLowerCase().normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '-')
      .replace(/-+/g, '-').replace(/^-|-$/g, '').substring(0, 28)
    slug = `${slugBase}-${Date.now().toString(36)}`
  }

  const propuestaUrl = `https://www.iarest.es/propuesta/${slug}`
  const emailCuerpo = emailData.cuerpo.replace(/__PROPUESTA_URL__/g, propuestaUrl)

  // WhatsApp draft con links siempre al final
  let waDraftRegen = ''
  try {
    const waR = await callAI(
      `Eres Alberto, fundador de ia.rest. WhatsApp corto, directo, cercano. Español de España. Solo el texto, sin JSON.`,
      `WhatsApp para ${empresa}. Pain point: ${(estudio.pain_points as string[])?.[0] || ''}. Argumento: ${argumento}. Notas: ${(lead.notas as string || '').substring(0,150)}. 2-4 líneas, saludo cercano, 1 dato concreto, propone quedar.`,
      250, 12000
    )
    waDraftRegen = `${waR.trim()}\n\n🔗 ${propuestaUrl}\n🌐 www.iarest.es`
  } catch {
    waDraftRegen = `Hola, te escribo por ia.rest — creo que encaja bien para ${empresa}.\n\n🔗 ${propuestaUrl}\n🌐 www.iarest.es`
  }

  // Preview email (primeros 200 chars)
  const preview = emailCuerpo.substring(0, 200).replace(/\n/g, ' ') + '…'

  // Guardar en BD
  const { data: current } = await supabase.from('leads').select('eventos').eq('id', leadId).single()
  const eventos = Array.isArray(current?.eventos) ? current.eventos : []

  await supabase.from('leads').update({
    propuesta_slug: slug,
    email_draft: emailCuerpo,
    email_asunto: emailData.asunto,
    whatsapp_draft: waDraftRegen,
    estado_pipeline: 'propuesta_lista',
    eventos: [...eventos, {
      tipo: '📝',
      texto: `Propuesta generada${nuevoFoco ? ` con foco: "${nuevoFoco}"` : ''}`,
      fecha: new Date().toISOString().split('T')[0]
    }]
  }).eq('id', leadId)

  // Actualizar mensaje Telegram con resultado
  await tgEditMessage(
    messageId,
    [
      `✅ <b>Propuesta lista — ${empresa}</b>`,
      ``,
      `📧 <b>Asunto:</b> ${emailData.asunto}`,
      `<i>${preview}</i>`,
      ``,
      `🔗 <a href="${propuestaUrl}">Ver propuesta pública</a>`,
      ``,
      lead.email
        ? `<a href="https://www.iarest.es/super">Enviar desde /super →</a>`
        : `⚠️ Añade el email del lead en /super para enviar`,
    ].join('\n')
  )

  // Si tiene email, también mandar botón para envío directo
  if (lead.email) {
    const token = process.env.TELEGRAM_BOT_TOKEN
    const chat_id = process.env.TELEGRAM_CHAT_ID
    if (token && chat_id) {
      await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id,
          text: `¿Envío el email a <b>${lead.email}</b>?`,
          parse_mode: 'HTML',
          reply_markup: {
            inline_keyboard: [[
              { text: '📨 Sí, enviar ahora', callback_data: `enviar_email:${leadId}` },
              { text: '✏️ Lo reviso antes', callback_data: `revisar_email:${leadId}` },
            ]]
          }
        }),
      }).catch(() => {})
    }
  }
}
