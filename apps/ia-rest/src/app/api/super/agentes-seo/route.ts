export const dynamic = 'force-dynamic'
export const maxDuration = 60

import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { getGscData, getGa4Data } from '@/lib/seo/gsc-ga4'
import { callAITools, callAISearch } from '@/lib/ai-client'

// ─── Tools (NVIDIA NIM, function-calling formato OpenAI) ──────────────────────
// web_search ya no es la herramienta nativa de Anthropic: es una herramienta custom respaldada
// por Gemini (búsqueda web). GSC/GA4 se ejecutan igual que antes.
const TOOLS = [
  {
    type: 'function',
    function: {
      name: 'web_search',
      description: 'Busca en la web (competencia, keywords, backlinks, noticias del sector) y devuelve un resumen con datos.',
      parameters: { type: 'object', properties: { query: { type: 'string', description: 'Consulta de búsqueda' } }, required: ['query'] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_gsc_data',
      description: 'Datos reales de Google Search Console de www.iarest.es: keywords con clics, impresiones, CTR y posición media.',
      parameters: {
        type: 'object',
        properties: {
          type: { type: 'string', enum: ['queries', 'pages', 'countries', 'devices'] },
          days: { type: 'number', description: 'Últimos N días (default 28)' },
          rowLimit: { type: 'number', description: 'Filas a devolver (default 25)' },
        },
        required: ['type'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_ga4_data',
      description: 'Datos reales de Google Analytics 4 de ia.rest: sesiones, usuarios, páginas, fuentes de tráfico, conversiones.',
      parameters: {
        type: 'object',
        properties: {
          report: { type: 'string', enum: ['overview', 'pages', 'sources', 'conversions', 'landing'] },
          days: { type: 'number', description: 'Últimos N días (default 28)' },
        },
        required: ['report'],
      },
    },
  },
]

async function executeTool(name: string, input: any): Promise<string> {
  if (name === 'web_search') {
    return callAISearch('Eres un asistente de investigación SEO. Resume con datos concretos y, si puedes, fuentes.', String(input?.query ?? ''), 1500)
  }
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

  try {
    const { messages } = await req.json()
    const toolLog: any[] = []
    const currentMessages: any[] = messages.map((m: any) => ({ role: m.role, content: m.content }))
    let finalText = ''

    for (let iterations = 0; iterations < 10; iterations++) {
      const msg = await callAITools(SYSTEM, currentMessages, TOOLS, 2048)

      if (msg.tool_calls?.length) {
        currentMessages.push({ role: 'assistant', content: msg.content ?? '', tool_calls: msg.tool_calls })
        for (const tc of msg.tool_calls) {
          let input: any = {}
          try { input = JSON.parse(tc.function.arguments || '{}') } catch { /* args no-JSON */ }
          const result = await executeTool(tc.function.name, input)
          toolLog.push({ tool: tc.function.name, input, result: result.slice(0, 300) })
          currentMessages.push({ role: 'tool', tool_call_id: tc.id, content: result })
        }
        continue
      }

      finalText = msg.content || ''
      break
    }

    return NextResponse.json({ text: finalText || 'Sin respuesta.', toolLog })
  } catch (err: any) {
    console.error('[agentes-seo]', err)
    return NextResponse.json({ error: String(err?.message || err) }, { status: 500 })
  }
}
