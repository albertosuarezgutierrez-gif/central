export const dynamic = 'force-dynamic'
export const maxDuration = 60

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { callAI, cleanJSON } from '@/lib/ai-client'
import { tgAlert } from '@/lib/telegram'

const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY || ''

// Queries de búsqueda para encontrar leads potenciales en España
const QUERIES_BUSQUEDA = [
  'grupo restaurantes Sevilla varios locales 2025 2026',
  'cadena bares restaurantes Andalucía expansión',
  'empresa catering bodas Sevilla haciendas eventos',
  'grupo hostelería Málaga Córdoba varios restaurantes',
  'restaurante Sevilla busca TPV gestión',
  'cadena hamburgueserías bares Sevilla franquicia',
  'grupo gastronómico Sevilla apertura nuevo local',
]

// ── Buscar con Claude web_search ────────────────────────────────────────────
async function buscarCandidatos(query: string): Promise<string> {
  if (!ANTHROPIC_KEY) return ''

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_KEY,
        'anthropic-version': '2023-06-01',
        'anthropic-beta': 'web-search-2025-03-05',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1000,
        tools: [{ type: 'web_search_20250305', name: 'web_search' }],
        messages: [{
          role: 'user',
          content: `Busca en internet: "${query}". 
          Encuentra grupos de restaurantes, cadenas de bares, empresas de catering o grupos hosteleros en España con varios locales.
          Para cada candidato devuelve SOLO JSON array:
          [{"nombre":"Nombre empresa","ciudad":"Ciudad","locales_estimados":3,"web":"url o null","descripcion":"1 frase","tipo":"restaurante|bar|catering|grupo"}]
          Máximo 3 candidatos relevantes. Solo JSON, sin texto adicional.`
        }],
      }),
    })

    const data = await res.json()
    // Extraer texto de la respuesta (puede tener bloques de tool_use + text)
    const textBlock = data.content?.find((b: { type: string }) => b.type === 'text')
    return textBlock?.text || ''
  } catch (e) {
    console.error('[prospeccion] Error Claude search:', e)
    return ''
  }
}

// ── Analizar candidato con NIM ──────────────────────────────────────────────
async function analizarCandidato(candidato: {
  nombre: string
  ciudad: string
  locales_estimados: number
  web: string | null
  descripcion: string
  tipo: string
}): Promise<{
  mrr_estimado: number
  puntuacion: number
  modulos: string[]
  argumento: string
}> {
  const raw = await callAI(
    `Eres consultor de ventas de ia.rest SaaS hostelería. Pricing: 59€ base + 20€/u(2-6) + 15€/u(7+). Responde SOLO JSON.`,
    `Candidato: ${candidato.nombre} | Ciudad: ${candidato.ciudad} | Locales: ${candidato.locales_estimados} | Tipo: ${candidato.tipo} | Info: ${candidato.descripcion}
    
JSON: {"mrr_estimado":150,"puntuacion_lead":65,"modulos_criticos":["voz","kds"],"argumento_principal":"1 frase de por qué ia.rest encaja"}`,
    400, 10000
  )

  try {
    const parsed = JSON.parse(cleanJSON(raw))
    return {
      mrr_estimado: parsed.mrr_estimado || 100,
      puntuacion: parsed.puntuacion_lead || 50,
      modulos: parsed.modulos_criticos || ['voz', 'kds'],
      argumento: parsed.argumento_principal || `ia.rest para ${candidato.nombre}`,
    }
  } catch {
    return { mrr_estimado: 100, puntuacion: 50, modulos: ['voz', 'kds'], argumento: `ia.rest para ${candidato.nombre}` }
  }
}

// ── Handler principal ────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createServerClient()

  // Obtener empresas ya en BD para evitar duplicados
  const { data: leadsExistentes } = await supabase
    .from('leads')
    .select('empresa, restaurante')
  const nombresExistentes = new Set(
    (leadsExistentes || []).flatMap(l =>
      [l.empresa, l.restaurante].filter(Boolean).map((n: string) => n.toLowerCase())
    )
  )

  // Buscar con 3 queries aleatorias esta semana
  const queriesSeleccionadas = QUERIES_BUSQUEDA
    .sort(() => Math.random() - 0.5)
    .slice(0, 3)

  const candidatosBrutos: Array<{
    nombre: string; ciudad: string; locales_estimados: number
    web: string | null; descripcion: string; tipo: string
  }> = []

  for (const query of queriesSeleccionadas) {
    const resultado = await buscarCandidatos(query)
    if (!resultado) continue

    try {
      const clean = resultado.replace(/```json|```/g, '').trim()
      // Extraer array JSON del texto
      const match = clean.match(/\[[\s\S]*\]/)
      if (!match) continue
      const lista = JSON.parse(match[0])
      if (Array.isArray(lista)) candidatosBrutos.push(...lista)
    } catch { /* ignorar resultados no parseables */ }

    // Pausa entre búsquedas
    await new Promise(r => setTimeout(r, 2000))
  }

  // Filtrar: sin duplicados, con nombre válido
  const candidatosFiltrados = candidatosBrutos
    .filter(c => c.nombre && !nombresExistentes.has(c.nombre.toLowerCase()))
    .filter((c, i, arr) => arr.findIndex(x => x.nombre.toLowerCase() === c.nombre.toLowerCase()) === i)
    .slice(0, 8) // máximo 8 por semana

  if (candidatosFiltrados.length === 0) {
    await tgAlert('🔍 Prospección semanal: sin candidatos nuevos esta semana.', 'info')
    return NextResponse.json({ ok: true, candidatos: 0 })
  }

  // Analizar cada candidato con NIM
  const candidatosAnalizados = await Promise.allSettled(
    candidatosFiltrados.map(async c => {
      const analisis = await analizarCandidato(c)
      return { ...c, ...analisis }
    })
  )

  const validos = candidatosAnalizados
    .filter(r => r.status === 'fulfilled')
    .map(r => (r as PromiseFulfilledResult<typeof candidatosFiltrados[0] & { mrr_estimado: number; puntuacion: number; modulos: string[]; argumento: string }>).value)
    .sort((a, b) => b.puntuacion - a.puntuacion)

  // Guardar en BD como prospectos
  if (validos.length > 0) {
    await supabase.from('leads').insert(
      validos.map(c => ({
        nombre: c.nombre,
        empresa: c.nombre,
        restaurante: c.nombre,
        ciudad: c.ciudad || 'España',
        web: c.web || null,
        tipo: 'prospecto',
        estado: 'nuevo',
        estado_pipeline: 'prospecto_ia',
        mrr_estimado: c.mrr_estimado,
        locales: String(c.locales_estimados || ''),
        notas: c.descripcion || '',
        pain_points: [],
        modulos_recomendados: c.modulos,
        estudio_completo: {
          argumento_principal: c.argumento,
          tipo_negocio: c.tipo,
          puntuacion_lead: c.puntuacion,
          origen: 'prospeccion_ia',
        },
        eventos: [{
          tipo: '🤖',
          texto: `Prospecto encontrado por IA. Puntuación: ${c.puntuacion}/100. MRR estimado: ${c.mrr_estimado}€`,
          fecha: new Date().toISOString().split('T')[0],
        }],
      }))
    )
  }

  // Notificar por Telegram con resumen
  const lineas = validos.slice(0, 6).map(c =>
    `• <b>${c.nombre}</b> (${c.ciudad}) — ${c.mrr_estimado}€/mes · ${c.puntuacion}/100\n  ${c.argumento}`
  ).join('\n\n')

  await tgAlert(
    `🔍 <b>Prospección semanal IA</b>\n${validos.length} candidatos nuevos encontrados\n\n${lineas}\n\n<a href="https://www.iarest.es/super">Ver todos en /super →</a>`,
    'info'
  )

  return NextResponse.json({ ok: true, candidatos: validos.length })
}
