export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import jwt from 'jsonwebtoken'

// Visitas de la web desde Google Analytics 4 (propiedad ia.rest · G-EN2YQLRLEX).
// Autentica como la service account (GOOGLE_SA_JSON) con acceso "Lector" a la
// propiedad, firma un JWT y consulta la GA4 Data API. Solo se ejecuta en server.
const PROPERTY_ID = process.env.GA4_PROPERTY_ID || '536881804'

function parseServiceAccount(raw: string): { client_email: string; private_key: string } {
  let txt = raw.trim()
  if (!txt.startsWith('{')) {
    try { txt = Buffer.from(txt, 'base64').toString('utf8') } catch { /* noop */ }
  }
  const sa = JSON.parse(txt)
  return { client_email: sa.client_email, private_key: sa.private_key }
}

async function getAccessToken(): Promise<string> {
  const raw = process.env.GOOGLE_SA_JSON
  if (!raw) throw new Error('Falta GOOGLE_SA_JSON en el entorno')
  const sa = parseServiceAccount(raw)
  if (!sa.client_email || !sa.private_key) throw new Error('GOOGLE_SA_JSON sin client_email/private_key')

  const now = Math.floor(Date.now() / 1000)
  const assertion = jwt.sign(
    {
      iss: sa.client_email,
      scope: 'https://www.googleapis.com/auth/analytics.readonly',
      aud: 'https://oauth2.googleapis.com/token',
      iat: now,
      exp: now + 3600,
    },
    sa.private_key,
    { algorithm: 'RS256' }
  )

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  })
  const data = await res.json()
  if (!data.access_token) throw new Error(`No se pudo obtener token: ${JSON.stringify(data).slice(0, 200)}`)
  return data.access_token as string
}

const num = (v: string | undefined) => Math.round(Number(v ?? 0)) || 0

export async function GET(req: NextRequest) {
  const session = getSession(req)
  if (!session || session.rol !== 'super_admin') {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
  }

  try {
    const token = await getAccessToken()

    const body = {
      requests: [
        {
          // Resumen: 4 rangos (hoy, ayer, 7d, 30d)
          dateRanges: [
            { startDate: 'today', endDate: 'today' },
            { startDate: 'yesterday', endDate: 'yesterday' },
            { startDate: '7daysAgo', endDate: 'today' },
            { startDate: '30daysAgo', endDate: 'today' },
          ],
          metrics: [{ name: 'sessions' }, { name: 'totalUsers' }, { name: 'screenPageViews' }],
        },
        {
          // Top páginas 7d
          dateRanges: [{ startDate: '7daysAgo', endDate: 'today' }],
          dimensions: [{ name: 'pagePath' }],
          metrics: [{ name: 'screenPageViews' }],
          orderBys: [{ metric: { metricName: 'screenPageViews' }, desc: true }],
          limit: 5,
        },
        {
          // Top fuentes 7d
          dateRanges: [{ startDate: '7daysAgo', endDate: 'today' }],
          dimensions: [{ name: 'sessionDefaultChannelGroup' }],
          metrics: [{ name: 'sessions' }],
          orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
          limit: 5,
        },
      ],
    }

    const res = await fetch(
      `https://analyticsdata.googleapis.com/v1beta/properties/${PROPERTY_ID}:batchRunReports`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }
    )
    const data = await res.json()
    if (!res.ok) {
      return NextResponse.json(
        { configured: false, error: data?.error?.message || `GA4 ${res.status}` },
        { status: 200 }
      )
    }

    const [resumen, paginas, fuentes] = data.reports ?? []

    // El reporte de resumen trae una fila por rango (dimensión dateRange implícita)
    const buckets = { hoy: 0, ayer: 0, d7: 0, d30: 0 }
    const usuarios = { hoy: 0, ayer: 0, d7: 0, d30: 0 }
    const vistas = { hoy: 0, ayer: 0, d7: 0, d30: 0 }
    const order: (keyof typeof buckets)[] = ['hoy', 'ayer', 'd7', 'd30']
    for (const row of resumen?.rows ?? []) {
      const tag = row.dimensionValues?.[0]?.value || '' // date_range_0..3
      const idx = Number(tag.split('_').pop())
      const key = order[idx]
      if (!key) continue
      buckets[key] = num(row.metricValues?.[0]?.value)
      usuarios[key] = num(row.metricValues?.[1]?.value)
      vistas[key] = num(row.metricValues?.[2]?.value)
    }

    const topPaginas = (paginas?.rows ?? []).map((r: any) => ({
      path: r.dimensionValues?.[0]?.value || '/',
      vistas: num(r.metricValues?.[0]?.value),
    }))
    const topFuentes = (fuentes?.rows ?? []).map((r: any) => ({
      fuente: r.dimensionValues?.[0]?.value || '(other)',
      sesiones: num(r.metricValues?.[0]?.value),
    }))

    return NextResponse.json({
      configured: true,
      sesiones: buckets,
      usuarios,
      vistas,
      topPaginas,
      topFuentes,
    })
  } catch (e: any) {
    return NextResponse.json({ configured: false, error: e?.message || 'Error GA4' }, { status: 200 })
  }
}
