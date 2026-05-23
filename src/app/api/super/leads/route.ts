export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getSession } from '@/lib/session'
import { callAI } from '@/lib/ai-client'
import { tgAlert } from '@/lib/telegram'
import { cleanJSON } from '@/lib/ai-client'

export async function GET(req: NextRequest) {
  const session = getSession(req)
  if (!session || session.rol !== 'super_admin') {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
  }
  const supabase = createServerClient()
  const { data, error } = await supabase
    .from('leads')
    .select('*')
    .order('created_at', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ leads: data })
}

export async function POST(req: NextRequest) {
  const session = getSession(req)
  if (!session || session.rol !== 'super_admin') {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
  }
  const body = await req.json()
  const { nombre, restaurante, empresa, ciudad, web, telefono, email, locales, tpv, contacto, notas } = body
  if (!nombre || !restaurante) {
    return NextResponse.json({ error: 'nombre y restaurante son obligatorios' }, { status: 400 })
  }
  const supabase = createServerClient()
  const eventoInicial = {
    tipo: '📋',
    texto: 'Lead creado — research IA en proceso…',
    fecha: new Date().toISOString().split('T')[0]
  }
  const { data, error } = await supabase
    .from('leads')
    .insert({
      nombre,
      restaurante,
      empresa: empresa || restaurante,
      ciudad: ciudad || 'Sevilla',
      web: web || null,
      telefono: telefono || '',
      email: email || null,
      locales: locales || null,
      tpv: tpv || null,
      contacto: contacto || null,
      notas: notas || null,
      tipo: 'personal',
      estado: 'nuevo',
      estado_pipeline: 'estudiando',
      eventos: [eventoInicial]
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // ── Research IA en background (fire-and-forget) ───────────────────────────
  // No await — la respuesta al cliente es inmediata
  runResearchBackground(data.id, data, supabase).catch(e =>
    console.error('[research-bg] Error:', e)
  )

  return NextResponse.json({ lead: data })
}

// ── Research en background ────────────────────────────────────────────────────
async function runResearchBackground(
  leadId: string,
  lead: Record<string, unknown>,
  supabase: ReturnType<typeof createServerClient>
) {
  const empresa = (lead.empresa || lead.restaurante || lead.nombre || 'Desconocido') as string
  const web = (lead.web || '') as string
  const notas = (lead.notas || '') as string
  const locales = (lead.locales || '') as string
  const tpv = (lead.tpv || '') as string

  // 1. Intentar obtener contenido web
  let webContent = ''
  if (web) {
    try {
      const res = await fetch(web, { signal: AbortSignal.timeout(6000), headers: { 'User-Agent': 'Mozilla/5.0' } })
      const html = await res.text()
      webContent = html
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .substring(0, 3000)
    } catch { webContent = '' }
  }

  // 2. Generar estudio
  const estudioRaw = await callAI(
    `Eres consultor experto en hostelería española. Analizas leads para ia.rest SaaS de gestión de restaurantes con IA.
Módulos: voz(comandas voz), kds(cocina digital), almacen(stock+costes), contabilidad(IVA 303+A3), qr(pedidos mesa), storefront(delivery propio), analytics(BI+forecaster), multi_local(grupos), eventos(catering), vinos(sommelier IA), bridge(impresoras ESC/POS), rrhh(fichaje+candidaturas).
Precio: 59€/mes base + 20€/u(2-6) + 15€/u(7+). Sin comisión. Trial 14d.
Responde SOLO JSON válido sin markdown.`,
    `Lead: ${empresa} | Web: ${web || 'N/A'} | Locales: ${locales || 'N/A'} | TPV: ${tpv || 'N/A'} | Notas: ${notas || 'N/A'} | Web content: ${webContent.substring(0, 1500) || 'N/A'}

JSON exacto:
{"resumen_negocio":"2-3 frases","tipo_negocio":"bar|restaurante|cafeteria|grupo|catering","ciudad":"ciudad","num_locales_estimado":1,"num_empleados_estimado":8,"ticket_medio_estimado":25,"tpv_actual":"TPV o Desconocido","coste_tpv_actual_mes":0,"pain_points":["p1","p2","p3"],"oportunidades":["o1","o2"],"modulos_criticos":["voz","kds"],"modulos_secundarios":["almacen"],"mrr_estimado":150,"ahorro_mensual_estimado":200,"argumento_principal":"argumento clave en 1 frase","objeciones_probables":["obj1"],"resolucion_objeciones":{"obj1":"resp"},"tono_propuesta":"profesional","nivel_urgencia":"media","puntuacion_lead":70}`,
    1500, 30000
  )

  let estudio: Record<string, unknown> = {}
  try { estudio = JSON.parse(cleanJSON(estudioRaw)) } catch {
    estudio = { resumen_negocio: empresa, pain_points: ['Gestión manual'], modulos_criticos: ['voz', 'kds'], modulos_secundarios: ['almacen'], mrr_estimado: 120, argumento_principal: `ia.rest para ${empresa}`, nivel_urgencia: 'media', puntuacion_lead: 60 }
  }

  // 3. Generar email
  const emailRaw = await callAI(
    `Eres Alberto, fundador de ia.rest. Emails directos, cercanos, español de España. Sin "innovador/solución/potente". Solo JSON válido.`,
    `Email para: ${empresa} | Argumento: ${estudio.argumento_principal} | Módulos: ${(estudio.modulos_criticos as string[])?.join(', ')} | Pain: ${(estudio.pain_points as string[])?.slice(0,2).join(', ')} | MRR: ${estudio.mrr_estimado}€

Reglas: máx 120 palabras, menciona el negocio, 1 pain point, incluye literalmente __PROPUESTA_URL__ al final, CTA visita en local. Firma: Alberto · ia.rest · hola@iarest.es

{"asunto":"asunto máx 60 chars","cuerpo":"texto con \\n. Incluir __PROPUESTA_URL__ literalmente."}`,
    800, 20000
  )

  let emailData = { asunto: `ia.rest para ${empresa}`, cuerpo: `Hola,\n\nTe escribo porque creo que ia.rest puede encajar muy bien en ${empresa}.\n\nPropuesta: __PROPUESTA_URL__\n\n¿Te parece si me paso un día por el local?\n\nAlberto · ia.rest · hola@iarest.es` }
  try { emailData = JSON.parse(cleanJSON(emailRaw)) } catch { /* usar default */ }

  // 4. Generar slug
  const slugBase = empresa.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').substring(0, 28)
  const slug = `${slugBase}-${Date.now().toString(36)}`
  const propuestaUrl = `https://www.iarest.es/propuesta/${slug}`
  const emailCuerpo = emailData.cuerpo.replace(/__PROPUESTA_URL__/g, propuestaUrl)

  // 5. Guardar todo en BD
  const { data: current } = await supabase.from('leads').select('eventos').eq('id', leadId).single()
  const eventos = Array.isArray(current?.eventos) ? current.eventos : []

  await supabase.from('leads').update({
    estudio_completo: estudio,
    pain_points: (estudio.pain_points as string[]) || [],
    modulos_recomendados: [...((estudio.modulos_criticos as string[]) || []), ...((estudio.modulos_secundarios as string[]) || [])],
    mrr_estimado: estudio.mrr_estimado || null,
    tpv: (estudio.tpv_actual as string) || (lead.tpv as string) || null,
    propuesta_slug: slug,
    email_draft: emailCuerpo,
    email_asunto: emailData.asunto,
    estado_pipeline: 'propuesta_lista',
    research_at: new Date().toISOString(),
    eventos: [...eventos, {
      tipo: '🔍',
      texto: `Research IA completado. Puntuación: ${estudio.puntuacion_lead}/100. MRR estimado: ${estudio.mrr_estimado}€/mes`,
      fecha: new Date().toISOString().split('T')[0]
    }]
  }).eq('id', leadId)

  // 6. Notificar
  tgAlert(
    `🎯 <b>Research completado</b>\n<b>${empresa}</b>\n💰 ${estudio.mrr_estimado}€/mes · ⭐ ${estudio.puntuacion_lead}/100\n📦 ${(estudio.modulos_criticos as string[])?.join(', ')}\n\n<a href="${propuestaUrl}">Ver propuesta</a>`,
    'info'
  )
}
