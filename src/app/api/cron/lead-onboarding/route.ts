// /api/cron/lead-onboarding — Lead Hunter v3 con Gemini Search grounding
// Acepta cualquier input (web, Instagram, Facebook, nombre) → búsqueda completa en internet
export const dynamic = 'force-dynamic'
export const maxDuration = 120

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { callAI, callAISearch, cleanJSON } from '@/lib/ai-client'

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const supabase = createServerClient()

  const hace72h = new Date(Date.now() - 72 * 60 * 60 * 1000).toISOString()
  const { data: leads } = await supabase
    .from('leads')
    .select('id, nombre, empresa, restaurante, web, email, notas, tpv, locales, ciudad, tipo_negocio, pain_points, datos_operativos')
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
      await new Promise(r => setTimeout(r, 2000))
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
  const ciudad = (lead.ciudad || '') as string
  const datosOp = (lead.datos_operativos as Record<string, unknown>) || {}

  // 1. Research completo con Gemini + Google Search grounding
  // Le pasamos todo lo que tengamos: nombre, web, ciudad, notas
  // Gemini busca en Google automáticamente para completar lo que falte
  const researchRaw = await callAISearch(
    `Eres un investigador de negocios especializado en hostelería española. 
Tu tarea es hacer un research COMPLETO de un negocio de hostelería usando todos los medios disponibles.
Busca en Google, Google Maps, redes sociales, directorios, prensa local — todo lo que encuentres.
Responde SOLO con JSON válido, sin texto adicional.`,
    `Investiga este negocio de hostelería:
Nombre: ${empresa}
${web ? `URL/Red social: ${web}` : ''}
${ciudad ? `Ciudad: ${ciudad}` : ''}
Tipo provisional (de sourcing, confírmalo o corrígelo, NO degrades una hacienda a restaurante): ${(lead.tipo_negocio as string) || 'desconocido'}
Si es catering: estima eventos/bodas al año, si hace bodas/empresa, aforo máximo, coste por comensal.
Si es hacienda/finca/espacio de eventos (tipo "eventos"): nº de espacios, aforo, si aparece en bodas.net/zankyou, si gestiona calendario online, si el catering es propio o externo.
Notas adicionales: ${(lead.notas as string || '').substring(0, 300)}
Datos conocidos: ${JSON.stringify(datosOp).substring(0, 300)}

Busca en internet TODO lo que puedas encontrar sobre este negocio y devuelve:
{
  "nombre_oficial": "nombre real del negocio",
  "tipo_negocio": "restaurante|bar|catering|eventos|grupo|mixto",
  "descripcion": "2-3 frases con info real encontrada online",
  "web_oficial": "URL si encontrada",
  "direccion": "dirección completa si encontrada",
  "telefono": "si encontrado",
  "ciudad": "ciudad confirmada",
  "num_locales": 1,
  "num_empleados_estimado": 8,
  "rating_google": 0.0,
  "num_resenas": 0,
  "precio_medio": "€|€€|€€€",
  "horario": "si encontrado",
  "tpv_actual": "nombre TPV o Desconocido",
  "redes_sociales": {"instagram": "", "facebook": ""},
  "menciones_prensa": ["titular 1 si hay"],
  "eventos_catering": true,
  "tiene_carta_online": false,
  "pain_points_detectados": ["p1", "p2", "p3"],
  "modulos_criticos": ["eventos", "almacen"],
  "modulos_secundarios": ["analytics"],
  "mrr_estimado": 150,
  "puntuacion_lead": 75,
  "argumento_principal": "frase gancho específica para este negocio que genere curiosidad y ganas de reunirse, máx 2 frases, sin explicar el producto",
  "tono_propuesta": "profesional|informal",
  "nivel_urgencia": "alta|media|baja"
}`,
    1600,
    50000
  )

  let estudio: Record<string, unknown> = {}
  try { estudio = JSON.parse(cleanJSON(researchRaw)) } catch {
    estudio = {
      descripcion: `Negocio hostelero: ${empresa}`,
      tipo_negocio: 'restaurante',
      pain_points_detectados: ['Gestión manual', 'Sin control costes'],
      modulos_criticos: ['voz', 'almacen'], modulos_secundarios: ['analytics'],
      mrr_estimado: 150,
      argumento_principal: `${empresa} tiene una oportunidad concreta que quiero contarte en 10 minutos.`,
      tono_propuesta: 'profesional', nivel_urgencia: 'media', puntuacion_lead: 65,
    }
  }

  // Normalizar campos con fallbacks
  const resumenNegocio = (estudio.descripcion || estudio.resumen_negocio || `Negocio hostelero: ${empresa}`) as string
  const painPoints = (estudio.pain_points_detectados || estudio.pain_points || ['Gestión manual']) as string[]
  const modulosCriticos = (estudio.modulos_criticos || ['voz']) as string[]
  const modulosSecundarios = (estudio.modulos_secundarios || ['analytics']) as string[]

  // 2. Slug
  const slugBase = empresa.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').substring(0, 35)
  const slug = slugBase
  const propuestaUrl = `https://www.iarest.es/propuesta/${slug}`

  const tipoNeg = ((estudio.tipo_negocio as string) || (lead.tipo_negocio as string) || '').toLowerCase()
  const esCatering = tipoNeg.includes('cater')
  const esEventos = !esCatering && (tipoNeg.includes('event') || tipoNeg.includes('hacienda') || tipoNeg.includes('finca') || tipoNeg.includes('espacio') || tipoNeg.includes('banquet') || tipoNeg.includes('bod'))
  const landingUrl = esCatering ? 'https://www.iarest.es/catering' : esEventos ? 'https://www.iarest.es/espacios' : 'https://www.iarest.es'
  const anguloVertical = esCatering
    ? 'Vertical CATERING: el dolor es cuadrar presupuestos y saber el coste/margen real por evento; menos horas de oficina.'
    : esEventos
    ? 'Vertical HACIENDA/ESPACIO DE EVENTOS: el dolor es llenar el calendario de la finca, no perder solicitudes (bodas.net) y cerrar contratos rápido.'
    : 'Vertical RESTAURANTE/BAR: comandas por voz y control de costes.'

  // 3. Email + WhatsApp en paralelo
  const [emailRaw, waRaw] = await Promise.allSettled([
    callAI(
      `Eres Alberto, fundador de ia.rest. Emails directos, cercanos, español de España. Sin "innovador/solución/potente". Solo JSON.
El objetivo es conseguir una reunión. 1 referencia real al negocio, proponer quedar sin presión.`,
      `Email para ${empresa}.
Gancho (úsalo adaptado, no literal): ${estudio.argumento_principal}
Info real del negocio: ${resumenNegocio}
Pain point principal: ${painPoints[0] || ''}
${anguloVertical}
Landing del vertical (enlázala como recurso además de la propuesta): ${landingUrl}
Reglas: máx 100 palabras, proponer llamada o visita, incluir __PROPUESTA_URL__ al final como "Te dejo esto por si quieres echarle un ojo antes:", firma Alberto · ia.rest
{"asunto":"máx 60 chars","cuerpo":"texto con \\n, incluir __PROPUESTA_URL__"}`,
      700, 20000, true
    ),
    callAI(
      `Eres Alberto, fundador de ia.rest. WhatsApp corto, directo, cercano. Español de España. Devuelve SOLO el texto del mensaje sin JSON.
Objetivo: conseguir una reunión. NO explicar el producto.`,
      `WhatsApp para ${empresa}.
Info real: ${resumenNegocio}
Algo concreto: ${painPoints[0] || estudio.argumento_principal}
${anguloVertical}
2-3 líneas. Saludo natural. 1 referencia real. Propone quedar. Max 1 emoji.`,
      300, 15000, true
    ),
  ])

  let emailData = { asunto: `ia.rest para ${empresa}`, cuerpo: `Hola,\n\n${estudio.argumento_principal}\n\nPropuesta: __PROPUESTA_URL__\n\nAlberto · ia.rest` }
  if (emailRaw.status === 'fulfilled') {
    try { emailData = JSON.parse(cleanJSON(emailRaw.value)) } catch { /* default */ }
  }
  const emailCuerpo = emailData.cuerpo.replace(/__PROPUESTA_URL__/g, propuestaUrl)

  const waDraft = `${waRaw.status === 'fulfilled' ? waRaw.value.trim() : `Hola, quería comentarte algo sobre ${empresa}.`}\n\n🔗 ${propuestaUrl}\n🌐 www.iarest.es`

  // 4. Guardar en BD
  const { data: current } = await supabase.from('leads').select('eventos').eq('id', lead.id as string).single()
  const eventos = Array.isArray(current?.eventos) ? current.eventos : []

  const updateData: Record<string, unknown> = {
    estudio_completo: estudio,
    pain_points: painPoints,
    modulos_recomendados: [...modulosCriticos, ...modulosSecundarios],
    mrr_estimado: (estudio.mrr_estimado as number) || null,
    tpv: (estudio.tpv_actual as string) || (lead.tpv as string) || null,
    propuesta_slug: slug,
    email_draft: emailCuerpo,
    email_asunto: emailData.asunto,
    whatsapp_draft: waDraft,
    estado_pipeline: 'propuesta_lista',
    research_at: new Date().toISOString(),
    eventos: [...eventos, {
      tipo: '🔍',
      texto: `Research automático (Gemini Search). Puntuación: ${estudio.puntuacion_lead}/100. MRR: ${estudio.mrr_estimado}€/mes`,
      fecha: new Date().toISOString().split('T')[0]
    }]
  }

  // Enriquecer lead con datos encontrados
  if (estudio.web_oficial && !lead.web) updateData.web = estudio.web_oficial
  if (estudio.direccion) updateData.direccion = estudio.direccion
  if (estudio.ciudad && !lead.ciudad) updateData.ciudad = estudio.ciudad

  await supabase.from('leads').update(updateData).eq('id', lead.id as string)

  // 5. Telegram
  const tgToken = process.env.TELEGRAM_BOT_TOKEN
  const chat_id = process.env.TELEGRAM_CHAT_ID
  if (tgToken && chat_id) {
    const ratingTexto = estudio.rating_google ? ` · ⭐${estudio.rating_google} (${estudio.num_resenas} reseñas)` : ''
    await fetch(`https://api.telegram.org/bot${tgToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id,
        parse_mode: 'HTML',
        text: [
          `🆕 <b>Lead listo: ${empresa}</b>`,
          ``,
          `📋 ${resumenNegocio.substring(0, 160)}`,
          estudio.direccion ? `📍 ${estudio.direccion}` : null,
          `💰 MRR estimado: <b>${estudio.mrr_estimado}€/mes</b>${ratingTexto}`,
          `📦 Módulos clave: ${modulosCriticos.join(', ')}`,
          `⭐ Puntuación: ${estudio.puntuacion_lead}/100`,
          ``,
          `📧 Email: <i>${emailData.asunto}</i>`,
          `📱 WhatsApp: listo para copiar`,
          `🔗 <a href="${propuestaUrl}">Ver propuesta →</a>`,
        ].filter(Boolean).join('\n'),
        reply_markup: {
          inline_keyboard: [
            [
              { text: '📱 Ver WhatsApp', callback_data: `ver_whatsapp:${lead.id}` },
              ...(lead.email
                ? [{ text: '📨 Enviar email', callback_data: `enviar_email:${lead.id}` }]
                : [{ text: '✏️ CRM', url: 'https://www.iarest.es/super' }]
              ),
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
