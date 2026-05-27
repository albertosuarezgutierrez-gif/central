// /api/cron/briefing-semanal — El cerebro del lunes
// 8:30 lunes: analiza fuentes → propone 3 temas → Alberto elige
// Tras elección: genera artículo blog + 3 posts IG de la semana

export const dynamic = 'force-dynamic'
export const maxDuration = 60

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { callAI, cleanJSON } from '@/lib/ai-client'
import { tgAlertButtons } from '@/lib/telegram'
import { obtenerNoticias } from '@/lib/instagram-context'
import { buildPipelineBloque } from '@/app/api/cron/pipeline-comercial/route'

interface TemaSemanada {
  num: number
  tema: string
  keyword_blog: string
  angulo: string
  fuente: string
  frase_hostelero?: string
  posts_ig: Array<{ dia: string; formato: string; angulo: string }>
}

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization')
  const isCron   = auth === `Bearer ${process.env.CRON_SECRET}`
  const isManual = req.nextUrl.searchParams.get('manual') === '1'
  if (!isCron && !isManual) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const supabase = createServerClient()

  // ── Leer todas las fuentes en paralelo ────────────────────────────────
  const hace2semanas = new Date(Date.now() - 14 * 86400000).toISOString()

  const [noticiasRes, reunionesRes, sugerenciasRes, ultimosBlogRes, ultimosIGRes] = await Promise.allSettled([
    obtenerNoticias(),
    supabase.from('leads_comunicacion')
      .select('texto_reunion, resumen_ia')
      .gte('created_at', hace2semanas)
      .not('texto_reunion', 'is', null)
      .order('created_at', { ascending: false })
      .limit(8),
    supabase.from('sugerencias')
      .select('contenido, categoria')
      .gte('created_at', hace2semanas)
      .order('created_at', { ascending: false })
      .limit(8),
    supabase.from('blog_borradores')
      .select('keyword, titulo')
      .order('created_at', { ascending: false })
      .limit(5),
    supabase.from('instagram_posts')
      .select('titulo, tema_elegido')
      .order('created_at', { ascending: false })
      .limit(5),
  ])

  const noticias    = noticiasRes.status    === 'fulfilled' ? noticiasRes.value    : []
  const reuniones   = reunionesRes.status   === 'fulfilled' ? reunionesRes.value.data ?? [] : []
  const sugerencias = sugerenciasRes.status === 'fulfilled' ? sugerenciasRes.value.data ?? [] : []
  const ultimosBlog = ultimosBlogRes.status === 'fulfilled' ? ultimosBlogRes.value.data ?? [] : []
  const ultimosIG   = ultimosIGRes.status   === 'fulfilled' ? ultimosIGRes.value.data ?? [] : []

  // ── NIM analiza todo y propone 3 temas semanales ──────────────────────
  const prompt = `Eres el estratega de contenido de ia.rest (TPV por voz, hostelería española, 59€/mes).

CONVERSACIONES CON HOSTELEROS (últimas 2 semanas):
${reuniones.map(r => `• "${r.texto_reunion?.slice(0,150) || r.resumen_ia?.slice(0,150)}"`).join('\n') || 'Sin reuniones aún'}

SUGERENCIAS DEL PERSONAL:
${sugerencias.map(s => `• ${s.categoria}: "${s.contenido?.slice(0,100)}"`).join('\n') || 'Sin sugerencias'}

NOTICIAS DEL SECTOR ESTA SEMANA:
${noticias.slice(0,6).map(n => `• ${n.titulo}`).join('\n') || 'Sin noticias'}

TEMAS YA PUBLICADOS EN BLOG (no repetir):
${ultimosBlog.map(b => `• ${b.keyword}`).join('\n') || 'Ninguno'}

TEMAS YA EN INSTAGRAM (no repetir):
${ultimosIG.map(p => `• ${p.tema_elegido || p.titulo}`).join('\n') || 'Ninguno'}

Propón exactamente 3 TEMAS para la semana completa. Cada tema debe:
- Tener suficiente profundidad para un artículo de blog completo (1500+ palabras)
- Generar 3 posts IG distintos el mismo tema (lunes/miércoles/viernes)
- Ser relevante para hosteleros españoles AHORA
- PROHIBIDO mencionar competidores por nombre

Para cada tema, sugiere los 3 posts IG con ángulos DISTINTOS:
- Lunes: vídeo animado (el artículo resumido, impacto visual)
- Miércoles: dato/estadística (el número más impactante del tema)
- Viernes: ángulo humano (cita, pregunta o testimonio)

Responde SOLO JSON array de 3 elementos:
[
  {
    "num": 1,
    "tema": "nombre del tema (max 50 chars)",
    "keyword_blog": "keyword SEO principal (2-4 palabras)",
    "angulo": "ángulo específico del artículo",
    "fuente": "De dónde viene la idea",
    "frase_hostelero": "frase literal si existe (max 80 chars, o null)",
    "posts_ig": [
      {"dia": "Lunes",     "formato": "video",    "angulo": "descripción del ángulo"},
      {"dia": "Miércoles", "formato": "stat",     "angulo": "descripción del dato"},
      {"dia": "Viernes",   "formato": "cita",     "angulo": "descripción del ángulo humano"}
    ]
  }
]`

  const raw = await callAI('Propón 3 temas semanales para blog+Instagram. SOLO JSON.', prompt, 800)
  let temas: TemaSemanada[] = []
  try { temas = JSON.parse(cleanJSON(raw)) } catch {
    temas = [
      { num: 1, tema: 'VeriFactu para hostelería 2026', keyword_blog: 'verifactu restaurantes', angulo: 'obligaciones y cómo cumplirlas', fuente: 'Noticia del sector', posts_ig: [
        { dia: 'Lunes', formato: 'video', angulo: 'qué es y por qué importa' },
        { dia: 'Miércoles', formato: 'stat', angulo: 'coste de no cumplir' },
        { dia: 'Viernes', formato: 'pregunta', angulo: '¿ya cumple tu restaurante?' },
      ]},
      { num: 2, tema: 'Reducir errores de comanda', keyword_blog: 'errores comanda restaurante', angulo: 'causas y soluciones prácticas', fuente: 'Frecuente en visitas', posts_ig: [
        { dia: 'Lunes', formato: 'video', angulo: 'el paper trail del error' },
        { dia: 'Miércoles', formato: 'stat', angulo: '67% vienen del papel' },
        { dia: 'Viernes', formato: 'tip', angulo: '3 cambios esta semana' },
      ]},
      { num: 3, tema: 'KDS en cocina: cómo funciona', keyword_blog: 'kds cocina restaurante', angulo: 'guía práctica de implantación', fuente: 'Módulo ia.rest', posts_ig: [
        { dia: 'Lunes', formato: 'video', angulo: 'demo en tiempo real' },
        { dia: 'Miércoles', formato: 'comparativa', angulo: 'con tickets vs sin tickets' },
        { dia: 'Viernes', formato: 'cita', angulo: 'experiencia de cocina' },
      ]},
    ]
  }

  // ── Guardar los 3 temas en BD para recuperarlos cuando Alberto elija ──
  const { data: semana } = await supabase
    .from('instagram_semana')
    .insert({
      semana: new Date().toISOString().split('T')[0],
      temas: temas,
      estado: 'pendiente_eleccion',
    })
    .select('id')
    .single()

  const semanaId = semana?.id || 'temp'

  // ── Bloque pipeline comercial (siempre al inicio del lunes) ──────────
  const pipelineBloque = await buildPipelineBloque().catch(() => '')

  // ── Mensaje Telegram con las 3 opciones ──────────────────────────────
  const formatoEmoji: Record<string, string> = {
    video:'🎬', stat:'📊', pregunta:'❓', tip:'💡',
    comparativa:'⚖️', cita:'💬', producto:'📱'
  }

  let msg = `📅 <b>Briefing semanal — ${new Date().toLocaleDateString('es-ES', { weekday:'long', day:'numeric', month:'long' })}</b>\n`
  if (pipelineBloque) msg += pipelineBloque + '\n'
  msg += `── Contenido esta semana ──\n¿De qué hablamos?\n\n`

  temas.forEach(t => {
    msg += `${t.num}️⃣ <b>${t.tema}</b>\n`
    if (t.frase_hostelero) msg += `   💬 <i>"${t.frase_hostelero}"</i>\n`
    msg += `   📌 ${t.fuente}\n`
    msg += `   📰 Blog: <i>${t.angulo}</i>\n`
    t.posts_ig.forEach(p => {
      msg += `   ${formatoEmoji[p.formato] || '📸'} ${p.dia}: ${p.angulo}\n`
    })
    msg += '\n'
  })

  msg += `Al elegir → genero el artículo de blog + 3 posts IG de la semana`

  await tgAlertButtons(msg, 'info', [
    temas.map(t => ({
      texto: `${t.num}️⃣ ${t.tema.slice(0,25)}`,
      callback: `briefing_elegir:${semanaId}:${t.num}`,
    })),
    [{ texto: '🔄 Otras ideas', callback: `briefing_otras:${semanaId}` }],
  ])

  return NextResponse.json({
    ok: true,
    semana: semanaId,
    temas: temas.length,
    fuentes: { reuniones: reuniones.length, sugerencias: sugerencias.length, noticias: noticias.length },
  })
}
