export const dynamic = 'force-dynamic'
export const maxDuration = 60

import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { getGscData, getGa4Data } from '@/lib/seo/gsc-ga4'

// ─── Tools ────────────────────────────────────────────────────────────────────
const CUSTOM_TOOLS = [
  {
    name: 'get_gsc_data',
    description: 'Datos reales de Google Search Console de www.iarest.es: keywords con clics, impresiones, CTR y posición media.',
    input_schema: {
      type: 'object',
      properties: {
        type: { type: 'string', enum: ['queries', 'pages', 'countries', 'devices'] },
        days: { type: 'number', description: 'Últimos N días (default 28)' },
        rowLimit: { type: 'number', description: 'Filas a devolver (default 25)' },
      },
      required: ['type'],
    },
  },
  {
    name: 'get_ga4_data',
    description: 'Datos reales de Google Analytics 4 de ia.rest: sesiones, usuarios, páginas, fuentes de tráfico, conversiones.',
    input_schema: {
      type: 'object',
      properties: {
        report: { type: 'string', enum: ['overview', 'pages', 'sources', 'conversions', 'landing'] },
        days: { type: 'number', description: 'Últimos N días (default 28)' },
      },
      required: ['report'],
    },
  },
]

async function executeTool(name: string, input: any): Promise<string> {
  if (name === 'get_gsc_data') return getGscData(input)
  if (name === 'get_ga4_data') return getGa4Data(input)
  return `Herramienta desconocida: ${name}`
}

const SYSTEM = `Eres el Agente SEO de ia.rest con acceso a datos reales de Google Search Console y Google Analytics 4.

PRODUCTO:
- ia.rest: Voice POS SaaS B2B hostelería española. Web: www.iarest.es
- Precio: 59€/mes + 20€/usuario. Sin comisión. Trial 14d.
- Competencia: SmartBar (99,99€), Agora TPV, ICG, UpHotel, Revo XEF
- Diferencial: único TPV por voz en español

HERRAMIENTAS:
- web_search: buscar competencia, keywords, backlinks, noticias sector
- get_gsc_data: keywords reales, impresiones, CTR, posición media en Google
- get_ga4_data: sesiones, usuarios, fuentes de tráfico, bounce rate, conversiones

METODOLOGÍA — SIEMPRE:
1. Antes de recomendar, pide datos reales de GSC + GA4
2. Cruza: impresiones altas + CTR bajo → title/meta mejorable
3. Cruza: tráfico alto + bounce alto → contenido o UX mejorable
4. Fuente orgánica baja → priorizar SEO técnico y contenido

FORMATO: datos primero, interpretación después.
Prioriza 🔴 alto / 🟡 importante / 🟢 mejora menor.
Copy: muestra versión actual vs propuesta.
Idioma: español.`

// ─── Endpoint ─────────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const session = getSession(req)
  if (!session || session.rol !== 'super_admin')
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const apiKey = process.env.ANTHROPIC_API_KEY
  const AVISO_ANTHROPIC = '⚠️ Esta función usa búsqueda web/herramientas vía Anthropic, que ahora mismo no está disponible (sin crédito). El resto del panel funciona con normalidad.'
  if (!apiKey) return NextResponse.json({ error: AVISO_ANTHROPIC }, { status: 500 })

  try {
    const { messages } = await req.json()
    const toolLog: any[] = []

    const allTools = [
      { type: 'web_search_20250305', name: 'web_search' },
      ...CUSTOM_TOOLS,
    ]

    let currentMessages = messages.map((m: any) => ({ role: m.role, content: m.content }))
    let finalText = ''
    let iterations = 0

    while (iterations < 10) {
      iterations++

      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'anthropic-beta': 'web-search-2025-03-05',
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 2048,
          system: SYSTEM,
          tools: allTools,
          messages: currentMessages,
        }),
      })

      const data = await res.json()
      if (!data.content) { finalText = 'Error: sin respuesta'; break }

      const texts = data.content.filter((b: any) => b.type === 'text')
      if (texts.length) finalText = texts.map((b: any) => b.text).join('')
      if (data.stop_reason === 'end_turn') break

      if (data.stop_reason === 'tool_use') {
        const toolUses = data.content.filter((b: any) => b.type === 'tool_use')
        currentMessages = [...currentMessages, { role: 'assistant', content: data.content }]

        const results = await Promise.all(
          toolUses.map(async (tu: any) => {
            let result: string
            if (tu.name === 'web_search') {
              const wsResult = data.content.find((b: any) => b.type === 'tool_result' && b.tool_use_id === tu.id)
              result = wsResult?.content?.[0]?.text || 'Búsqueda procesada'
            } else {
              result = await executeTool(tu.name, tu.input)
              toolLog.push({ tool: tu.name, input: tu.input, result: result.slice(0, 300) })
            }
            return { type: 'tool_result', tool_use_id: tu.id, content: result }
          })
        )

        currentMessages = [...currentMessages, { role: 'user', content: results }]
        continue
      }
      break
    }

    return NextResponse.json({ text: finalText || 'Sin respuesta.', toolLog })
  } catch (err: any) {
    console.error('[agentes-seo]', err)
    const m = String(err?.message || err)
    const sinSaldo = /credit balance|too low|insufficient|x-api-key|authentication|\b401\b|\b403\b/i.test(m)
    return NextResponse.json({ error: sinSaldo ? AVISO_ANTHROPIC : m }, { status: 500 })
  }
}
