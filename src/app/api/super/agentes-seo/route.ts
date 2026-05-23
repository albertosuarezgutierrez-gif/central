export const dynamic = 'force-dynamic'
export const maxDuration = 60

import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { createSign } from 'crypto'

// ─── Config ───────────────────────────────────────────────────────────────────
const SA_EMAIL     = process.env.DRIVE_SA_EMAIL || ''
const SA_KEY       = (process.env.DRIVE_SA_KEY || '').replace(/\\n/g, '\n')
const GA4_PROPERTY = '536881804'
const GSC_SITE     = 'https://www.iarest.es/'

// ─── Google JWT Auth (multi-scope) ───────────────────────────────────────────
async function getGoogleToken(scope: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000)
  const header  = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url')
  const payload = Buffer.from(JSON.stringify({
    iss: SA_EMAIL, scope,
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600, iat: now,
  })).toString('base64url')
  const sign = createSign('RSA-SHA256')
  sign.update(`${header}.${payload}`)
  const sig  = sign.sign(SA_KEY, 'base64url')
  const res  = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${header}.${payload}.${sig}`,
  })
  const data = await res.json()
  if (!data.access_token) throw new Error(`Google auth error: ${JSON.stringify(data)}`)
  return data.access_token
}

// ─── GSC ──────────────────────────────────────────────────────────────────────
async function getGscData(input: {
  type: 'queries' | 'pages' | 'countries' | 'devices'
  days?: number
  rowLimit?: number
}): Promise<string> {
  try {
    const token = await getGoogleToken('https://www.googleapis.com/auth/webmasters.readonly')
    const { type = 'queries', days = 28, rowLimit = 20 } = input

    const endDate   = new Date()
    const startDate = new Date(Date.now() - days * 86400000)
    const fmt = (d: Date) => d.toISOString().split('T')[0]

    const dimensionMap: Record<string, string> = {
      queries:   'query',
      pages:     'page',
      countries: 'country',
      devices:   'device',
    }

    const body = {
      startDate: fmt(startDate),
      endDate:   fmt(endDate),
      dimensions: [dimensionMap[type]],
      rowLimit,
      orderBy: [{ fieldName: 'clicks', sortOrder: 'DESCENDING' }],
    }

    const res = await fetch(
      `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(GSC_SITE)}/searchAnalytics/query`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }
    )

    if (!res.ok) {
      const err = await res.text()
      return `Error GSC ${res.status}: ${err}`
    }

    const data = await res.json()
    if (!data.rows?.length) return 'Sin datos en GSC para este periodo. Verifica que el service account tiene acceso.'

    const rows = data.rows.map((r: any) => {
      const key  = r.keys[0]
      const clks = r.clicks
      const imp  = r.impressions
      const ctr  = (r.ctr * 100).toFixed(1) + '%'
      const pos  = r.position.toFixed(1)
      return `${key} | clics:${clks} | impresiones:${imp} | CTR:${ctr} | pos:${pos}`
    })

    return `GSC ${type} (últimos ${days}d):\n${rows.join('\n')}`
  } catch (e: any) {
    return `Error GSC: ${e.message}`
  }
}

// ─── GA4 ──────────────────────────────────────────────────────────────────────
async function getGa4Data(input: {
  report: 'overview' | 'pages' | 'sources' | 'conversions' | 'landing'
  days?: number
}): Promise<string> {
  try {
    const token = await getGoogleToken('https://www.googleapis.com/auth/analytics.readonly')
    const { report = 'overview', days = 28 } = input

    const endDate   = 'today'
    const startDate = `${days}daysAgo`

    const reportConfigs: Record<string, { dimensions: any[]; metrics: any[] }> = {
      overview: {
        dimensions: [{ name: 'date' }],
        metrics: [
          { name: 'sessions' },
          { name: 'activeUsers' },
          { name: 'bounceRate' },
          { name: 'averageSessionDuration' },
          { name: 'screenPageViews' },
        ],
      },
      pages: {
        dimensions: [{ name: 'pagePath' }],
        metrics: [
          { name: 'screenPageViews' },
          { name: 'activeUsers' },
          { name: 'bounceRate' },
          { name: 'averageSessionDuration' },
        ],
      },
      sources: {
        dimensions: [{ name: 'sessionDefaultChannelGroup' }],
        metrics: [
          { name: 'sessions' },
          { name: 'activeUsers' },
          { name: 'bounceRate' },
          { name: 'conversions' },
        ],
      },
      landing: {
        dimensions: [{ name: 'landingPage' }],
        metrics: [
          { name: 'sessions' },
          { name: 'bounceRate' },
          { name: 'conversions' },
          { name: 'activeUsers' },
        ],
      },
      conversions: {
        dimensions: [{ name: 'eventName' }],
        metrics: [
          { name: 'eventCount' },
          { name: 'conversions' },
          { name: 'totalRevenue' },
        ],
      },
    }

    const config = reportConfigs[report]

    const res = await fetch(
      `https://analyticsdata.googleapis.com/v1beta/properties/${GA4_PROPERTY}:runReport`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dateRanges: [{ startDate, endDate }],
          dimensions: config.dimensions,
          metrics:    config.metrics,
          limit:      25,
          orderBys:   [{ metric: { metricName: config.metrics[0].name }, desc: true }],
        }),
      }
    )

    if (!res.ok) {
      const err = await res.text()
      return `Error GA4 ${res.status}: ${err}`
    }

    const data = await res.json()
    if (!data.rows?.length) return 'Sin datos en GA4 para este periodo. Verifica que el service account tiene acceso a la propiedad.'

    const dimNames = data.dimensionHeaders.map((h: any) => h.name)
    const metNames = data.metricHeaders.map((h: any) => h.name)

    const rows = data.rows.slice(0, 20).map((r: any) => {
      const dims = r.dimensionValues.map((v: any, i: number) => `${dimNames[i]}:${v.value}`).join(' | ')
      const mets = r.metricValues.map((v: any, i: number) => {
        const val = metNames[i].includes('Rate') || metNames[i].includes('rate')
          ? (parseFloat(v.value) * 100).toFixed(1) + '%'
          : metNames[i].includes('Duration') || metNames[i].includes('duration')
            ? Math.round(parseFloat(v.value)) + 's'
            : parseFloat(v.value).toFixed(0)
        return `${metNames[i].replace('screen', '').replace('Page', 'pg').replace('Views', 'vistas')}:${val}`
      }).join(' | ')
      return `${dims} → ${mets}`
    })

    // Totales si hay
    const totals = data.totals?.[0]
    let totStr = ''
    if (totals) {
      totStr = '\nTOTALES: ' + totals.metricValues.map((v: any, i: number) => `${metNames[i]}:${parseFloat(v.value).toFixed(0)}`).join(' | ')
    }

    return `GA4 ${report} (últimos ${days}d):\n${rows.join('\n')}${totStr}`
  } catch (e: any) {
    return `Error GA4: ${e.message}`
  }
}

// ─── Tools definition ─────────────────────────────────────────────────────────
const TOOLS = [
  {
    name: 'web_search',
    type: 'web_search_20250305' as const,
  },
  {
    name: 'get_gsc_data',
    description: 'Obtiene datos reales de Google Search Console de www.iarest.es: keywords que generan clics/impresiones, páginas indexadas, países, dispositivos.',
    input_schema: {
      type: 'object',
      properties: {
        type: {
          type: 'string',
          enum: ['queries', 'pages', 'countries', 'devices'],
          description: 'queries=keywords, pages=URLs, countries=países, devices=dispositivos',
        },
        days:     { type: 'number', description: 'Últimos N días (default 28)' },
        rowLimit: { type: 'number', description: 'Número de filas (default 20, max 50)' },
      },
      required: ['type'],
    },
  },
  {
    name: 'get_ga4_data',
    description: 'Obtiene datos reales de Google Analytics 4 de ia.rest: sesiones, usuarios, páginas más vistas, fuentes de tráfico, páginas de entrada, conversiones.',
    input_schema: {
      type: 'object',
      properties: {
        report: {
          type: 'string',
          enum: ['overview', 'pages', 'sources', 'conversions', 'landing'],
          description: 'overview=visión general, pages=páginas más vistas, sources=fuentes de tráfico, landing=páginas de entrada, conversions=eventos/conversiones',
        },
        days: { type: 'number', description: 'Últimos N días (default 28)' },
      },
      required: ['report'],
    },
  },
]

async function executeTool(name: string, input: any): Promise<string> {
  switch (name) {
    case 'get_gsc_data': return getGscData(input)
    case 'get_ga4_data': return getGa4Data(input)
    default: return `Herramienta desconocida: ${name}`
  }
}

// ─── System prompt ────────────────────────────────────────────────────────────
const SYSTEM = `Eres el Agente SEO de ia.rest con acceso a datos reales de Google Search Console y Google Analytics 4.

PRODUCTO:
- ia.rest: Voice POS SaaS B2B para hostelería española. Web: www.iarest.es
- Precio: 59€/mes + 20€/usuario. Sin comisión. Trial 14d.
- Competencia: SmartBar (99,99€), Agora TPV, ICG, UpHotel, Revo XEF
- Diferencial: único TPV por voz en español, precio más bajo del mercado

HERRAMIENTAS DISPONIBLES:
- web_search: buscar en internet (competencia, keywords, backlinks, noticias sector)
- get_gsc_data: datos reales de GSC (keywords, impresiones, CTR, posición media)
- get_ga4_data: datos reales de GA4 (sesiones, usuarios, fuentes, comportamiento)

METODOLOGÍA:
1. Cuando analices SEO, SIEMPRE empieza pidiendo datos reales de GSC y GA4 antes de dar recomendaciones
2. Cruza datos: keywords con muchas impresiones + CTR bajo = título/meta description mejorable
3. Cruza datos: páginas con tráfico + bounce rate alto = contenido o UX mejorable
4. Fuentes de tráfico: si organic es bajo, priorizar SEO; si direct es alto, hay awareness pero falta captación
5. Para competencia: busca en web qué keywords trabajan ellos que nosotros no

FORMATO DE RESPUESTAS:
- Datos primero, interpretación después
- Prioriza: 🔴 impacto alto / 🟡 importante / 🟢 mejora menor
- Para copy (title, meta, H1): muestra versión actual vs versión propuesta
- Siempre incluye el "por qué" con datos que lo justifiquen
- Idioma: español`

// ─── Endpoint ─────────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const session = getSession(req)
  if (!session || session.rol !== 'super_admin')
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'ANTHROPIC_API_KEY no configurada' }, { status: 500 })

  try {
    const { messages } = await req.json()
    const toolLog: { tool: string; input: any; result: string }[] = []

    // Separar web_search (tipo nativo) de herramientas custom
    const anthropicTools = [
      { type: 'web_search_20250305', name: 'web_search' },
      ...TOOLS.filter(t => t.name !== 'web_search').map(t => ({
        name: t.name,
        description: (t as any).description,
        input_schema: (t as any).input_schema,
      })),
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
          tools: anthropicTools,
          messages: currentMessages,
        }),
      })

      const data = await res.json()
      if (!data.content) { finalText = 'Error: sin respuesta del modelo'; break }

      const textBlocks = data.content.filter((b: any) => b.type === 'text')
      if (textBlocks.length > 0) finalText = textBlocks.map((b: any) => b.text).join('')

      if (data.stop_reason === 'end_turn') break

      if (data.stop_reason === 'tool_use') {
        const toolUses = data.content.filter((b: any) => b.type === 'tool_use')
        currentMessages = [...currentMessages, { role: 'assistant', content: data.content }]

        // web_search lo gestiona Anthropic nativamente — pasamos su result directo
        // nuestras tools custom las ejecutamos nosotros
        const toolResults = await Promise.all(
          toolUses.map(async (tu: any) => {
            let result: string
            if (tu.name === 'web_search') {
              // web_search result viene como tool_result en el content del assistant
              const wsResult = data.content.find(
                (b: any) => b.type === 'tool_result' && b.tool_use_id === tu.id
              )
              result = wsResult?.content?.[0]?.text || 'Búsqueda completada'
            } else {
              result = await executeTool(tu.name, tu.input)
              toolLog.push({ tool: tu.name, input: tu.input, result: result.slice(0, 300) })
            }
            return { type: 'tool_result', tool_use_id: tu.id, content: result }
          })
        )

        currentMessages = [...currentMessages, { role: 'user', content: toolResults }]
        continue
      }

      break
    }

    return NextResponse.json({ text: finalText || 'Sin respuesta.', toolLog })
  } catch (err: any) {
    console.error('[agentes-seo]', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
