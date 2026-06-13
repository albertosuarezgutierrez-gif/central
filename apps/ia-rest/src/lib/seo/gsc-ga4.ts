// apps/ia-rest/src/lib/seo/gsc-ga4.ts
// Lectura de Google Search Console + GA4. Compartido por agentes-seo y seo-agent.
const GA4_PROPERTY = '536881804'
const GSC_SITE     = 'https://www.iarest.es/'

// ─── OAuth2 — obtener access token desde refresh token ───────────────────────
export async function getOAuthToken(): Promise<string> {
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
export async function getGscData(input: {
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
export async function getGa4Data(input: {
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
