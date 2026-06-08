export const dynamic = 'force-dynamic'
export const maxDuration = 60

import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'

const GA4_PROPERTY = '536881804'
const GSC_SITE     = 'https://www.iarest.es/'

// ─── OAuth2 — obtener access token desde refresh token ───────────────────────
async function getOAuthToken(): Promise<string> {
  const refreshToken = process.env.GOOGLE_OAUTH_REFRESH_TOKEN
  if (!refreshToken) throw new Error('GOOGLE_OAUTH_REFRESH_TOKEN no configurado. Ve a /super y conecta Google.')

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type:    'refresh_token',
      refresh_token: refreshToken,
      client_id:     process.env.GOOGLE_CLIENT_ID || '',
      client_secret: process.env.GOOGLE_CLIENT_SECRET || '',
    }),
  })
  const data = await res.json()
  if (!data.access_token) throw new Error(`OAuth error: ${JSON.stringify(data)}`)
  return data.access_token
}

// ─── GSC ──────────────────────────────────────────────────────────────────────
async function getGscData(input: {
  type: 'queries' | 'pages' | 'countries' | 'devices'
  days?: number
  rowLimit?: number
}): Promise<string> {
  try {
    const token = await getOAuthToken()
    const { type = 'queries', days = 28, rowLimit = 25 } = input

    const endDate   = new Date()
    const startDate = new Date(Date.now() - days * 86400000)
    const fmt = (d: Date) => d.toISOString().split('T')[0]

    const dimMap: Record<string, string> = {
      queries: 'query', pages: 'page', countries: 'country', devices: 'device',
    }

    const res = await fetch(
      `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(GSC_SITE)}/searchAnalytics/query`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          startDate: fmt(startDate), endDate: fmt(endDate),
          dimensions: [dimMap[type]],
          rowLimit,
          orderBy: [{ fieldName: 'clicks', sortOrder: 'DESCENDING' }],
        }),
      }
    )

    if (!res.ok) return `Error GSC ${res.status}: ${await res.text()}`
    const data = await res.json()
    if (!data.rows?.length) return 'Sin datos GSC para este periodo.'

    const rows = data.rows.map((r: any) => {
      const ctr = (r.ctr * 100).toFixed(1) + '%'
      const pos = r.position.toFixed(1)
      return `${r.keys[0]} | clics:${r.clicks} | imp:${r.impressions} | CTR:${ctr} | pos:${pos}`
    })
    return `GSC ${type} (últimos ${days}d):\n${rows.join('\n')}`
  } catch (e: any) { return `Error GSC: ${e.message}` }
}

// ─── GA4 ──────────────────────────────────────────────────────────────────────
async function getGa4Data(input: {
  report: 'overview' | 'pages' | 'sources' | 'conversions' | 'landing'
  days?: number
}): Promise<string> {
  try {
    const token = await getOAuthToken()
    const { report = 'overview', days = 28 } = input

    const configs: Record<string, { dimensions: any[]; metrics: any[] }> = {
      overview: {
        dimensions: [{ name: 'date' }],
        metrics: [{ name: 'sessions' }, { name: 'activeUsers' }, { name: 'bounceRate' }, { name: 'averageSessionDuration' }, { name: 'screenPageViews' }],
      },
      pages: {
        dimensions: [{ name: 'pagePath' }],
        metrics: [{ name: 'screenPageViews' }, { name: 'activeUsers' }, { name: 'bounceRate' }, { name: 'averageSessionDuration' }],
      },
      sources: {
        dimensions: [{ name: 'sessionDefaultChannelGroup' }],
        metrics: [{ name: 'sessions' }, { name: 'activeUsers' }, { name: 'bounceRate' }, { name: 'conversions' }],
      },
      landing: {
        dimensions: [{ name: 'landingPage' }],
        metrics: [{ name: 'sessions' }, { name: 'bounceRate' }, { name: 'conversions' }, { name: 'activeUsers' }],
      },
      conversions: {
        dimensions: [{ name: 'eventName' }],
        metrics: [{ name: 'eventCount' }, { name: 'conversions' }],
      },
    }

    const cfg = configs[report]
    const res = await fetch(
      `https://analyticsdata.googleapis.com/v1beta/properties/${GA4_PROPERTY}:runReport`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dateRanges: [{ startDate: `${days}daysAgo`, endDate: 'today' }],
          dimensions: cfg.dimensions,
          metrics:    cfg.metrics,
          limit: 25,
          orderBys: [{ metric: { metricName: cfg.metrics[0].name }, desc: true }],
        }),
      }
    )

    if (!res.ok) return `Error GA4 ${res.status}: ${await res.text()}`
    const data = await res.json()
    if (!data.rows?.length) return 'Sin datos GA4 para este periodo.'

    const dimH = data.dimensionHeaders.map((h: any) => h.name)
    const metH = data.metricHeaders.map((h: any) => h.name)

    const rows = data.rows.slice(0, 20).map((r: any) => {
      const dims = r.dimensionValues.map((v: any, i: number) => `${dimH[i]}:${v.value}`).join(' | ')
      const mets = r.metricValues.map((v: any, i: number) => {
        const n = metH[i]
        const v2 = parseFloat(r.metricValues[i].value)
        const val = n.includes('Rate') ? (v2 * 100).toFixed(1) + '%'
          : n.includes('Duration') ? Math.round(v2) + 's'
          : v2.toFixed(0)
        return `${n}:${val}`
      }).join(' | ')
      return `${dims} → ${mets}`
    })

    const tot = data.totals?.[0]
    const totStr = tot ? '\nTOTALES: ' + tot.metricValues.map((v: any, i: number) => `${metH[i]}:${parseFloat(v.value).toFixed(0)}`).join(' | ') : ''
    return `GA4 ${report} (últimos ${days}d):\n${rows.join('\n')}${totStr}`
  } catch (e: any) { return `Error GA4: ${e.message}` }
}

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
