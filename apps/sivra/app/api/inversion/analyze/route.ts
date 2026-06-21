import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { aiComplete } from '@/lib/ai-client'

const GMAIL_LABEL = process.env.GMAIL_LABEL || 'inmobiliaria'

const PORTAL_DOMAINS = ['idealista.com','fotocasa.es','kyero.com','habitaclia.com','pisos.com','milanuncios.com','boe.es','subastas.boe.es']
const SKIP_DOMAINS   = ['unsubscribe','tracking','pixel','open.','click.','mailchimp','sendgrid','mailtrack','mandrillapp','list-manage','amazonaws.com/track']

const SYSTEM_PROMPT = `Eres experto inmobiliario en Huelva, Costa de la Luz y Aljarafe sevillano. Analiza correos de inmobiliarias, subastas y alertas de bajada de precio. Devuelve SOLO JSON sin markdown:
{"es_inmobiliaria":true,"propiedades":[{"titulo":"título corto","tipo":"chalet|parcela|finca|casa|piso|apartamento|otro","zona":"municipio","precio":null,"precio_anterior":null,"es_bajada_precio":false,"metros":null,"tiene_piscina":null,"es_rustica":null,"cerca_playa":null,"puntuacion_chollo":5,"razon_chollo":"motivo en 1 frase","link":null,"es_subasta":false}],"resumen":"1 frase"}
Puntuación 1-10: 10=precio bajo+playa+piscina, 1=caro/no interesa. Las bajadas de precio SUMAN +2 a la puntuación.
Si el email es alerta de bajada de precio: es_bajada_precio=true, precio=precio nuevo, precio_anterior=precio antiguo.
Perfil: inversión/residencia, Huelva costa o Aljarafe, chalet/parcela rústica, piscina deseable, playa cerca ideal.
Si hay URLs de anuncios (idealista, fotocasa, kyero, habitaclia, pisos.com, milanuncios) cópialas exactas en "link".
Si no es inmobiliaria: {"es_inmobiliaria":false,"propiedades":[],"resumen":""}`

async function getGoogleAccessToken(): Promise<string> {
  const { GMAIL_REFRESH_TOKEN: rt, GOOGLE_CLIENT_ID: cid, GOOGLE_CLIENT_SECRET: cs } = process.env
  if (!rt || !cid || !cs) throw new Error('Gmail OAuth no configurado (GMAIL_REFRESH_TOKEN / GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET)')
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: rt, client_id: cid, client_secret: cs }),
  })
  const data = await res.json()
  if (!data.access_token) throw new Error(`Token Google fallido: ${JSON.stringify(data)}`)
  return data.access_token
}

function decodeBase64Url(data: string): string {
  return Buffer.from(data.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf-8')
}

function extractBody(payload: any, depth = 0): string {
  if (depth > 5) return ''
  if (payload?.body?.data) return decodeBase64Url(payload.body.data)
  if (payload?.parts) {
    for (const p of payload.parts) {
      if (p.mimeType === 'text/plain' && p.body?.data) return decodeBase64Url(p.body.data)
    }
    for (const p of payload.parts) {
      if (p.mimeType === 'text/html' && p.body?.data)
        return decodeBase64Url(p.body.data).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')
      if (p.parts) { const nested = extractBody(p, depth + 1); if (nested) return nested }
    }
  }
  return ''
}

function extractAllLinks(text: string): string[] {
  const raw = (text.match(/https?:\/\/[^\s"'<>)\]]+/gi) || []).map(u => u.replace(/[).,;>"'\]]+$/, ''))
  const clean = [...new Set(raw)].filter(u => !SKIP_DOMAINS.some(s => u.toLowerCase().includes(s)))
  const portals = clean.filter(u => PORTAL_DOMAINS.some(d => u.includes(d)))
  const others  = clean.filter(u => !PORTAL_DOMAINS.some(d => u.includes(d)))
  return [...portals, ...others].slice(0, 10)
}

function extractPortalLinks(text: string): string[] {
  return extractAllLinks(text).filter(u => PORTAL_DOMAINS.some(d => u.includes(d))).slice(0, 5)
}

function extractPhone(text: string): string | null {
  const m = text.match(/(?:\+34|0034)?\s*[679]\d{2}[\s.-]?\d{3}[\s.-]?\d{3}/)
  if (!m) return null
  return m[0].replace(/[\s.-]/g, '').replace(/^0034/, '+34')
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { since } = await req.json()
  if (!since) return NextResponse.json({ error: 'Parámetro since requerido' }, { status: 400 })

  try {
    const token = await getGoogleAccessToken()

    // ── Step 1: search Gmail ────────────────────────────────────────────────
    const query     = `label:${GMAIL_LABEL} after:${since}`
    const searchRes = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(query)}&maxResults=25`,
      { headers: { Authorization: `Bearer ${token}` } }
    )
    const searchData = await searchRes.json()
    if (searchRes.status !== 200)
      return NextResponse.json({ error: `Gmail API error: ${JSON.stringify(searchData)}` }, { status: 502 })

    const messageIds: string[] = (searchData.messages || []).map((m: any) => m.id)
    if (!messageIds.length)
      return NextResponse.json({ propiedades: [], message: 'Sin correos nuevos desde el último análisis.', emails_analyzed: 0 })

    // ── Step 2: fetch full content in parallel ──────────────────────────────
    const emails: any[] = (await Promise.all(
      messageIds.map(async (id) => {
        try {
          const r   = await fetch(
            `https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=full`,
            { headers: { Authorization: `Bearer ${token}` } }
          )
          const msg  = await r.json()
          const hdrs = msg.payload?.headers || []
          return {
            id,
            subject: hdrs.find((h: any) => h.name === 'Subject')?.value || '',
            from:    hdrs.find((h: any) => h.name === 'From')?.value || '',
            date:    hdrs.find((h: any) => h.name === 'Date')?.value || '',
            body:    extractBody(msg.payload || {}).slice(0, 3000),
          }
        } catch { return null }
      })
    )).filter(Boolean)

    // ── Step 3: analyze in parallel batches of 5 ───────────────────────────
    // Usa NVIDIA NIM (gratis) → Claude fallback via aiComplete()
    const BATCH    = 5
    const newProps: any[] = []
    let newestMs   = 0

    for (let i = 0; i < emails.length; i += BATCH) {
      const batch   = emails.slice(i, i + BATCH)
      const results = await Promise.all(batch.map(async (em: any) => {
        const portalLinks = extractPortalLinks(em.body)
        const allLinks    = extractAllLinks(em.body)
        const phone       = extractPhone(em.body)
        const emailMs     = (() => { try { return new Date(em.date).getTime() } catch { return 0 } })()
        try {
          const txt = (await aiComplete(
            [{ role: 'user', content: `ASUNTO: ${em.subject}\nDE: ${em.from}\nFECHA: ${em.date}\nLINKS: ${portalLinks.length ? portalLinks.join(' | ') : 'ninguno'}\nCONTENIDO: ${em.body}` }],
            { system: SYSTEM_PROMPT, maxTokens: 800, temperature: 0.1 }
          )).replace(/```json|```/g, '').trim()

          let parsed: any
          try { parsed = JSON.parse(txt) } catch { parsed = { es_inmobiliaria: false, propiedades: [] } }
          return { props: parsed.es_inmobiliaria ? (parsed.propiedades || []) : [], emailMs, em, portalLinks, allLinks, phone }
        } catch {
          return { props: [], emailMs, em, portalLinks, allLinks, phone }
        }
      }))

      for (const { props, emailMs, em, portalLinks, allLinks, phone } of results) {
        if (emailMs && !isNaN(emailMs) && emailMs > newestMs) newestMs = emailMs
        for (const p of props) {
          const bestLink = p.link || (portalLinks.length === 1 ? portalLinks[0] : null)
          newProps.push({
            ...p,
            link:             bestLink,
            links_all:        allLinks,
            telefono:         phone,
            email_from:       em.from,
            email_subject:    em.subject,
            email_message_id: em.id,
            email_body:       em.body,
          })
        }
      }
    }

    const newestDate = newestMs > 0 ? new Date(newestMs).toISOString() : new Date().toISOString()
    return NextResponse.json({ propiedades: newProps, ultima_fecha: newestDate, emails_analyzed: emails.length })

  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
