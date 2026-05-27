// /api/cron/lead-onboarding — Detecta leads nuevos sin research y lanza flujo completo
// Genera: estudio IA + propuesta + email + WhatsApp draft + avisa Telegram con botones
export const dynamic = 'force-dynamic'
export const maxDuration = 120

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { callAI, cleanJSON } from '@/lib/ai-client'

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const supabase = createServerClient()

  // Leads nuevos sin research, últimas 72h
  const hace72h = new Date(Date.now() - 72 * 60 * 60 * 1000).toISOString()
  const { data: leads } = await supabase
    .from('leads')
    .select('id, nombre, empresa, restaurante, web, email, notas, tpv, locales, ciudad, pain_points, datos_operativos')
    .is('research_at', null)
    .neq('estado', 'descartado')
    .gte('created_at', hace72h)
    .order('created_at', { ascending: true })
    .limit(3)

  if (!leads || leads.length === 0) {
    return NextResponse.json({ ok: true, procesados: 0 })
  }

  const resultados: Array<{ id: string; empresa: string | null; ok: boolean; slug?: string; error?: string }> = []
  for (const lead of leads) {
    try {
      const res = await procesarLead(lead, supabase)
      resultados.push({ id: lead.id, empresa: lead.empresa || lead.restaurante || lead.nombre, ok: true, slug: res.slug })
      await new Promise(r => setTimeout(r, 3000))
    } catch (e) {
      console.error('[lead-onboarding] Error en lead', lead.id, e)
      resultados.push({ id: lead.id, empresa: lead.empresa || lead.nombre, ok: false, error: String(e) })
    }
  }

  return NextResponse.json({ ok: true, procesados: resultados.length, resultados })
}

async function procesarLead(
  lead: Record<string, unknown>,
  supabase: ReturnType<typeof createServerClient>
) {
  const empresa = (lead.empresa || lead.restaurante || lead.nombre || 'Desconocido') as string
  const web = (lead.web || '') as string
  const datosOp = (lead.datos_operativos as Record<string, unknown>) || {}

  // 1. Contenido web
  let webContent = ''
  if (web) {
    try {
      const res = await fetch(web, { signal: AbortSignal.timeout(6000), headers: { 'User-Agent': 'Mozilla/5.0' } })
      const html = await res.text()
      webContent = html
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
        .replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').substring(0, 3000)
    } catch { webContent = '' }
  }

  // 2. Estudio IA
  const estudioRaw = await callAI(
    `Eres consultor experto en hostelería española analizando negocios para ia.rest (SaaS gestión voz, 59€/mes base).
Módulos: voz, kds, almacen, contabilidad, qr, storefront, analytics, eventos, vinos, rrhh.
Responde SOLO JSON válido.`,
    `Lead: ${empresa} | Web: ${web || 'n/a'} | Ciudad: ${lead.ciudad || 'n/a'}
Notas: ${(lead.notas as string || '').substring(0, 300)}
Datos: ${JSON.stringify(datosOp).substring(0, 400)}
Pain points conocidos: ${JSON.stringify(lead.pain_points || []).substring(0, 200)}
Web content: ${webContent.substring(0, 1500)}

JSON:
{"resumen_negocio":"2-3 frases","tipo_negocio":"restaurante|bar|catering|grupo","num_locales_estimado":1,"num_empleados_estimado":8,"tpv_actual":"nombre o Desconocido","pain_points":["p1","p2","p3"],"modulos_criticos":["eventos","almacen"],"modulos_secundarios":["analytics"],"mrr_estimado":150,"argumento_principal":"argumento más poderoso específico para este negocio","tono_propuesta":"profesional|informal","nivel_urgencia":"alta|media|baja","puntuacion_lead":75}`,
    1200, 30000
  )

  let estudio: Record<string, unknown> = {}
  try { estudio = JSON.parse(cleanJSON(estudioRaw)) } catch {
    estudio = {
      resumen_negocio: `Negocio hostelero: ${empresa}`,
      tipo_negocio: 'catering', pain_points: ['Gestión manual', 'Sin control costes'],
      modulos_criticos: ['eventos', 'almacen'], modulos_secundarios: ['analytics'],
      mrr_estimado: 150, argumento_principal: `Gestiona ${empresa} sin hojas de cálculo`,
      tono_propuesta: 'profesional', nivel_urgencia: 'media', puntuacion_lead: 65,
    }
  }

  // 3. Slug (limpio, sin timestamp si ya es específico)
  const slugBase = empresa.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').substring(0, 35)
  const slug = slugBase
  const propuestaUrl = `https://www.iarest.es/propuesta/${slug}`

  // 4. Email draft
  const emailRaw = await callAI(
    `Eres Alberto, fundador de ia.rest. Emails directos, cercanos, español de España. Sin "innovador/solución/potente". Solo JSON.`,
    `Email para ${empresa}.
Argumento: ${estudio.argumento_principal}
Pain points: ${(estudio.pain_points as string[])?.slice(0, 2).join(', ')}
Módulos: ${(estudio.modulos_criticos as string[])?.join(', ')}
MRR: ${estudio.mrr_estimado}€/mes

Reglas: máx 120 palabras, 1 pain point concreto, incluir __PROPUESTA_URL__ al final, CTA quedar en su local sin presión, firma Alberto · ia.rest · hola@iarest.es
{"asunto":"máx 60 chars","cuerpo":"texto con \\n, incluir __PROPUESTA_URL__"}`,
    700, 20000
  )
  let emailData = { asunto: `ia.rest para ${empresa}`, cuerpo: `Hola,\n\n${estudio.argumento_principal}\n\nPropuesta: __PROPUESTA_URL__\n\nAlberto · ia.rest · hola@iarest.es` }
  try { emailData = JSON.parse(cleanJSON(emailRaw)) } catch { /* default */ }
  const emailCuerpo = emailData.cuerpo.replace(/__PROPUESTA_URL__/g, propuestaUrl)

  // 5. WhatsApp draft
  const relacionInfo = (lead.notas as string || '').substring(0, 200)
  const waRaw = await callAI(
    `Eres Alberto, fundador de ia.rest. WhatsApp corto, directo, cercano. Español de España. Devuelve SOLO el texto del mensaje.`,
    `WhatsApp para ${empresa}.
Contexto relación: ${relacionInfo}
Pain point principal: ${(estudio.pain_points as string[])?.[0] || ''}
Argumento: ${estudio.argumento_principal}
Propuesta URL: ${propuestaUrl}

2-4 líneas máximo. Saludo cercano. 1 cosa concreta del negocio. Propone quedar. Max 2 emojis. Sin palabrería corporativa.`,
    300, 15000
  )
  // Siempre incluir propuesta + web al final, sin depender de la IA
  const waDraft = `${waRaw.trim()}\n\n🔗 ${propuestaUrl}\n🌐 www.iarest.es`

  // 6. Guardar en BD
  const { data: current } = await supabase.from('leads').select('eventos').eq('id', lead.id as string).single()
  const eventos = Array.isArray(current?.eventos) ? current.eventos : []

  await supabase.from('leads').update({
    estudio_completo: estudio,
    pain_points: (estudio.pain_points as string[]) || [],
    modulos_recomendados: [...((estudio.modulos_criticos as string[]) || []), ...((estudio.modulos_secundarios as string[]) || [])],
    mrr_estimado: estudio.mrr_estimado as number || null,
    tpv: (estudio.tpv_actual as string) || (lead.tpv as string),
    propuesta_slug: slug,
    email_draft: emailCuerpo,
    email_asunto: emailData.asunto,
    whatsapp_draft: waDraft,
    estado_pipeline: 'propuesta_lista',
    research_at: new Date().toISOString(),
    eventos: [...eventos, {
      tipo: '🔍',
      texto: `Research automático. Puntuación: ${estudio.puntuacion_lead}/100. MRR: ${estudio.mrr_estimado}€/mes`,
      fecha: new Date().toISOString().split('T')[0]
    }]
  }).eq('id', lead.id as string)

  // 7. Telegram con botones
  const token = process.env.TELEGRAM_BOT_TOKEN
  const chat_id = process.env.TELEGRAM_CHAT_ID
  if (token && chat_id) {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id,
        parse_mode: 'HTML',
        text: [
          `🆕 <b>Lead listo: ${empresa}</b>`,
          ``,
          `📋 ${(estudio.resumen_negocio as string || '').substring(0, 130)}`,
          `💰 MRR estimado: <b>${estudio.mrr_estimado}€/mes</b>`,
          `📦 Módulos clave: ${(estudio.modulos_criticos as string[])?.join(', ')}`,
          `⭐ Puntuación: ${estudio.puntuacion_lead}/100`,
          ``,
          `📧 Email: <i>${emailData.asunto}</i>`,
          `📱 WhatsApp: listo para copiar`,
          `🔗 <a href="${propuestaUrl}">Ver propuesta →</a>`,
        ].join('\n'),
        reply_markup: {
          inline_keyboard: [
            [
              { text: '📱 Ver WhatsApp', callback_data: `ver_whatsapp:${lead.id}` },
              ...(lead.email ? [{ text: '📨 Enviar email', callback_data: `enviar_email:${lead.id}` }] : [{ text: '✏️ CRM', url: 'https://www.iarest.es/super' }]),
            ],
            [
              { text: '🔗 Ver propuesta', url: propuestaUrl },
              { text: '🔄 Regenerar', callback_data: `propuesta_ok:${lead.id}` },
            ]
          ]
        }
      }),
    }).catch(console.error)
  }

  return { slug, propuestaUrl }
}
