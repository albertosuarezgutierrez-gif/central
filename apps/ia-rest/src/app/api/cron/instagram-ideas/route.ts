// /api/cron/instagram-ideas — Extrae ideas de conversaciones reales
// Lunes 8:30 — antes del blog-seo
// Fuentes: CRM reuniones + sugerencias + Google News

export const dynamic = 'force-dynamic'
export const maxDuration = 60

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { callAI, cleanJSON } from '@/lib/ai-client'
import { tgAlertButtons } from '@/lib/telegram'
import { obtenerNoticias } from '@/lib/instagram-context'

const FORMATOS = ['stat', 'pregunta', 'tip', 'comparativa', 'cita', 'producto', 'video']

interface Idea {
  num: number
  titulo: string
  fuente: string
  frase_original?: string
  formato_sugerido: string
  razon: string
}

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization')
  const isCron   = auth === `Bearer ${process.env.CRON_SECRET}`
  const isManual = req.nextUrl.searchParams.get('manual') === '1'
  if (!isCron && !isManual) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const supabase = createServerClient()

  // ── 1. Leer reuniones CRM (últimas 2 semanas) ──────────────────────────
  const hace2semanas = new Date(Date.now() - 14 * 86400000).toISOString()
  const { data: reuniones } = await supabase
    .from('leads_comunicacion')
    .select('texto_reunion, resumen_ia, empresa_nombre:leads(nombre, empresa)')
    .gte('created_at', hace2semanas)
    .not('texto_reunion', 'is', null)
    .order('created_at', { ascending: false })
    .limit(10)

  // ── 2. Leer sugerencias recientes ──────────────────────────────────────
  const { data: sugerencias } = await supabase
    .from('sugerencias')
    .select('contenido, categoria, local_id')
    .gte('created_at', hace2semanas)
    .order('created_at', { ascending: false })
    .limit(10)

  // ── 3. Noticias del sector ─────────────────────────────────────────────
  const noticias = await obtenerNoticias().catch(() => [])

  // ── 4. Último post publicado (para no repetir tema) ────────────────────
  const { data: ultimoPost } = await supabase
    .from('instagram_posts')
    .select('titulo, plantilla')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  // ── 5. NIM analiza todo y extrae 3 ideas ──────────────────────────────
  const reunionesTexto = reuniones?.map(r => {
    const empresa = (r.empresa_nombre as any)?.empresa || (r.empresa_nombre as any)?.nombre || 'Lead'
    return `• ${empresa}: "${r.texto_reunion?.slice(0, 200) || r.resumen_ia?.slice(0, 200)}"`
  }).join('\n') || 'Sin reuniones recientes'

  const sugerenciasTexto = sugerencias?.map(s =>
    `• ${s.categoria || 'general'}: "${s.contenido?.slice(0, 150)}"`
  ).join('\n') || 'Sin sugerencias recientes'

  const noticiasTexto = noticias.slice(0, 5).map(n => `• ${n.titulo}`).join('\n') || 'Sin noticias'

  const prompt = `Eres el estratega de contenido de ia.rest (TPV por voz, hostelería española).

CONVERSACIONES CON HOSTELEROS (últimas 2 semanas):
${reunionesTexto}

SUGERENCIAS DE PERSONAL EN RESTAURANTES:
${sugerenciasTexto}

NOTICIAS DEL SECTOR ESTA SEMANA:
${noticiasTexto}

ÚLTIMO POST PUBLICADO: "${ultimoPost?.titulo || 'ninguno'}" (plantilla: ${ultimoPost?.plantilla || 'ninguna'})

FORMATOS DISPONIBLES: stat | pregunta | tip | comparativa | cita | video

Extrae exactamente 3 ideas para posts de Instagram. Prioriza:
1. Frases literales de hosteleros (más auténtico)
2. Problemas repetidos en sugerencias
3. Noticias del sector si son muy relevantes

PROHIBIDO: mencionar competidores por nombre.

Responde SOLO JSON:
[
  {
    "num": 1,
    "titulo": "título del post sugerido (max 60 chars)",
    "fuente": "Reunión con X" | "Sugerencia de hostelero" | "Noticia del sector",
    "frase_original": "frase literal del hostelero si existe (max 80 chars)",
    "formato_sugerido": "stat|pregunta|tip|comparativa|cita|video",
    "razon": "por qué este tema ahora (max 20 palabras)"
  }
]`

  const raw = await callAI('Extrae ideas Instagram de conversaciones hosteleros. SOLO JSON array.', prompt, 600)
  let ideas: Idea[] = []
  try {
    ideas = JSON.parse(cleanJSON(raw))
  } catch {
    ideas = [
      { num: 1, titulo: 'Las 3 preguntas que más nos hacen los hosteleros', fuente: 'Reuniones recientes', formato_sugerido: 'tip', razon: 'Temas frecuentes en visitas' },
      { num: 2, titulo: '¿Cuánto tiempo pierde tu equipo con el TPV actual?', fuente: 'Noticia del sector', formato_sugerido: 'pregunta', razon: 'Relevante esta semana' },
      { num: 3, titulo: 'Antes de ia.rest vs después — experiencia real', fuente: 'Sugerencia de hostelero', formato_sugerido: 'comparativa', razon: 'Testimonio representativo' },
    ]
  }

  // ── 6. Guardar borradores en BD ────────────────────────────────────────
  const { data: ideaRows } = await supabase
    .from('instagram_borradores')
    .insert(ideas.map(idea => ({
      plantilla: idea.formato_sugerido === 'video' ? 'producto' : idea.formato_sugerido,
      titulo: idea.titulo,
      sub: idea.fuente,
      caption: idea.frase_original ? `"${idea.frase_original}" — ${idea.fuente}` : '',
      tema_elegido: idea.titulo,
      modulo_relacionado: idea.fuente,
      estado: 'pendiente',
    })))
    .select('id')

  const ids = ideaRows?.map(r => r.id) || []

  // ── 7. Mensaje Telegram con las 3 ideas y botones ─────────────────────
  const formatoEmoji: Record<string, string> = {
    stat: '📊', pregunta: '❓', tip: '💡', comparativa: '⚖️',
    cita: '💬', producto: '📱', video: '🎬'
  }

  let msg = `🧠 <b>Ideas Instagram esta semana</b>\n`
  msg += `<i>Basadas en tus conversaciones con hosteleros</i>\n\n`

  ideas.forEach((idea, i) => {
    const emoji = formatoEmoji[idea.formato_sugerido] || '📸'
    msg += `${i + 1}️⃣ ${emoji} <b>${idea.titulo}</b>\n`
    if (idea.frase_original) msg += `   💬 <i>"${idea.frase_original}"</i>\n`
    msg += `   📌 ${idea.fuente} · ${idea.razon}\n\n`
  })

  msg += `¿Cuál generamos primero?`

  const botones: Array<Array<{ texto: string; callback: string }>> = []

  // Botón por cada idea
  ideas.forEach((idea, i) => {
    const id = ids[i]
    if (id) {
      botones.push([
        { texto: `✅ Generar #${i + 1}`, callback: `ig_generar_idea:${id}:${idea.formato_sugerido}` },
      ])
    }
  })

  botones.push([
    { texto: '🔄 Otras ideas', callback: 'ig_otras_ideas' },
    { texto: '✏️ Propongo yo', callback: 'ig_proponer' },
  ])

  await tgAlertButtons(msg, 'info', botones)

  return NextResponse.json({
    ok: true,
    ideas: ideas.length,
    fuentes: {
      reuniones: reuniones?.length || 0,
      sugerencias: sugerencias?.length || 0,
      noticias: noticias.length,
    }
  })
}
