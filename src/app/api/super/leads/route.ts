export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getSession } from '@/lib/session'
import { callAI } from '@/lib/ai-client'
import { tgAlert, tgEstudio } from '@/lib/telegram'
import { cleanJSON } from '@/lib/ai-client'

export async function GET(req: NextRequest) {
  const session = getSession(req)
  if (!session || session.rol !== 'super_admin') {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
  }
  const supabase = createServerClient()
  const { data, error } = await supabase
    .from('leads')
    .select('*, leads_contactos(id, nombre, cargo, telefono, email, es_decisor, canal_preferido)')
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

  // 3. Guardar estudio en BD (SIN propuesta aún — esperamos OK de Alberto)
  const { data: current } = await supabase.from('leads').select('eventos').eq('id', leadId).single()
  const eventos = Array.isArray(current?.eventos) ? current.eventos : []

  await supabase.from('leads').update({
    estudio_completo: estudio,
    pain_points: (estudio.pain_points as string[]) || [],
    modulos_recomendados: [...((estudio.modulos_criticos as string[]) || []), ...((estudio.modulos_secundarios as string[]) || [])],
    mrr_estimado: estudio.mrr_estimado || null,
    tpv: (estudio.tpv_actual as string) || (lead.tpv as string) || null,
    estado_pipeline: 'esperando_ok',
    research_at: new Date().toISOString(),
    eventos: [...eventos, {
      tipo: '🔍',
      texto: `Research completado. Puntuación: ${estudio.puntuacion_lead}/100. MRR: ${estudio.mrr_estimado}€/mes. Esperando OK en Telegram.`,
      fecha: new Date().toISOString().split('T')[0]
    }]
  }).eq('id', leadId)

  // 6. Mandar estudio a Telegram con botones de aprobación
  await tgEstudio(leadId, {
    empresa,
    resumen: estudio.resumen_negocio as string || empresa,
    argumento: estudio.argumento_principal as string || '',
    modulos: [...((estudio.modulos_criticos as string[]) || []), ...((estudio.modulos_secundarios as string[]) || [])],
    mrr: estudio.mrr_estimado as number || 0,
    puntuacion: estudio.puntuacion_lead as number || 0,
    painPoints: (estudio.pain_points as string[]) || [],
  })
}
