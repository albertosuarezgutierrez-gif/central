export const dynamic = 'force-dynamic'
export const maxDuration = 60

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'

const CLIENT_ID     = process.env.GOOGLE_CLIENT_ID || ''
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || ''
const GSC_SITE      = 'https://www.iarest.es/'
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY || ''
const TELEGRAM_BOT  = process.env.TELEGRAM_BOT_TOKEN || ''
const TELEGRAM_CHAT = process.env.TELEGRAM_CHAT_ID || ''
const GH_PAT        = process.env.GH_PAT || ''
const GH_REPO       = 'albertosuarezgutierrez-gif/ia.rest'

// Keywords que ya tienen artículo publicado
const ARTICULOS_EXISTENTES = [
  'tpv-voz-para-bares',
  'verifactu-restaurantes-guia-2026',
  'comanda-por-voz-como-funciona',
  'reducir-errores-comanda-restaurante',
  'alternativa-numier-tpv',
]

async function getOAuthToken(): Promise<string> {
  const rt = process.env.GOOGLE_OAUTH_REFRESH_TOKEN
  if (!rt) throw new Error('GOOGLE_OAUTH_REFRESH_TOKEN no configurado')
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: rt, client_id: CLIENT_ID, client_secret: CLIENT_SECRET }),
  })
  const data = await res.json()
  if (!data.access_token) throw new Error(`OAuth error: ${JSON.stringify(data)}`)
  return data.access_token
}

async function getGscKeywords(): Promise<{ query: string; impressions: number; clicks: number; ctr: number; position: number }[]> {
  const token = await getOAuthToken()
  const res = await fetch(
    `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(GSC_SITE)}/searchAnalytics/query`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        startDate: new Date(Date.now() - 90 * 86400000).toISOString().split('T')[0],
        endDate: new Date().toISOString().split('T')[0],
        dimensions: ['query'],
        rowLimit: 50,
        orderBy: [{ fieldName: 'impressions', sortOrder: 'DESCENDING' }],
      }),
    }
  )
  const data = await res.json()
  return (data.rows || []).map((r: any) => ({
    query: r.keys[0], impressions: r.impressions, clicks: r.clicks,
    ctr: r.ctr, position: r.position,
  }))
}

async function elegirKeyword(keywords: any[], existentes: string[]): Promise<string | null> {
  // Filtrar branded y demasiado genéricas
  const excluir = ['iarest', 'ia rest', 'ia.rest', 'restaurant service']
  const candidatas = keywords.filter(k => {
    const q = k.query.toLowerCase()
    if (excluir.some(e => q === e)) return false
    if (k.impressions < 2) return false
    // No tiene artículo aún
    const slug = q.replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
    return !existentes.some(e => e.includes(slug.split('-')[0]))
  })

  // Priorizar: impresiones altas + posición media + sin artículo
  if (candidatas.length > 0) {
    candidatas.sort((a, b) => b.impressions - a.impressions)
    return candidatas[0].query
  }

  // Si no hay keywords en GSC, usar lista predefinida de oportunidades
  const oportunidades = [
    'alternativa smartbar tpv',
    'tpv hosteleria sin comision',
    'sistema comandas restaurante',
    'software tpv bares espana',
    'kds cocina restaurante',
  ]
  const slug0 = oportunidades[Math.floor(Date.now() / 86400000) % oportunidades.length]
  return slug0
}

async function generarArticulo(keyword: string): Promise<{ titulo: string; slug: string; meta: string; tsx: string }> {
  const slug = keyword.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

  const prompt = `Eres un experto en SEO y copywriting para hostelería española. Genera un artículo de blog completo para ia.rest (TPV por voz, 59€/mes, sin comisión, www.iarest.es).

KEYWORD PRINCIPAL: "${keyword}"
SLUG: /blog/${slug}

REGLAS ABSOLUTAS:
- No inventar cifras de clientes ni testimonios falsos
- No usar palabras: "innovador", "revolucionario", "disruptivo", "potente"
- Tono directo, para dueños de bar/restaurante
- Comparar con competencia (SmartBar 99,99€, Agora, ICG) solo con datos verificables
- Longitud: ~1800 palabras

RESPONDE SOLO con un JSON válido, sin markdown ni backticks:
{
  "titulo": "título del artículo (55-60 chars)",
  "meta_description": "meta description (155 chars)",
  "h1": "H1 del artículo",
  "intro": "párrafo introductorio (2-3 frases)",
  "secciones": [
    {
      "h2": "título sección",
      "contenido": "contenido HTML básico de la sección (párrafos, listas, etc)"
    }
  ],
  "faq": [
    { "pregunta": "...", "respuesta": "..." }
  ],
  "cta_texto": "texto del CTA final"
}`

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 4096,
      messages: [{ role: 'user', content: prompt }],
    }),
  })

  const data = await res.json()
  const raw = data.content?.[0]?.text || ''

  let parsed: any
  try {
    // Limpiar posibles backticks
    const clean = raw.replace(/```json|```/g, '').trim()
    parsed = JSON.parse(clean)
  } catch {
    throw new Error(`No se pudo parsear JSON del artículo: ${raw.slice(0, 200)}`)
  }

  // Generar el TSX completo
  const tsx = generarTSX(parsed, slug, keyword)

  return {
    titulo: parsed.titulo,
    slug,
    meta: parsed.meta_description,
    tsx,
  }
}

function generarTSX(data: any, slug: string, keyword: string): string {
  const secciones = (data.secciones || []).map((s: any) => `
        <section style={{ marginBottom: 48 }}>
          <h2 style={{ fontFamily: SE, fontSize: 26, color: '#1A1714', margin: '0 0 16px', lineHeight: 1.2 }}>
            ${s.h2.replace(/'/g, "\\'")}
          </h2>
          <div style={{ fontSize: 15, lineHeight: 1.75, color: '#3A332C' }}
            dangerouslySetInnerHTML={{ __html: \`${s.contenido.replace(/`/g, '\\`').replace(/\$/g, '\\$')}\` }}
          />
        </section>
        <div style={{ borderTop: '1px solid #D8CDB6', margin: '0 0 48px' }} />`
  ).join('\n')

  const faqs = (data.faq || []).map((f: any) => `
            <div style={{ marginBottom: 16, padding: '18px 20px', background: '#EFE7D6', border: '1px solid #D8CDB6', borderRadius: 8 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#1A1714', marginBottom: 8 }}>${f.pregunta.replace(/'/g, "\\'")}</div>
              <div style={{ fontSize: 13, color: '#6B5F52', lineHeight: 1.65 }}>${f.respuesta.replace(/'/g, "\\'")}</div>
            </div>`
  ).join('\n')

  return `import { SE, SN, SM } from '@/lib/colors'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: '${data.titulo.replace(/'/g, "\\'")}',
  description: '${data.meta_description.replace(/'/g, "\\'")}',
  alternates: { canonical: 'https://www.iarest.es/blog/${slug}' },
  openGraph: {
    title: '${data.titulo.replace(/'/g, "\\'")}',
    description: '${data.meta_description.replace(/'/g, "\\'")}',
    url: 'https://www.iarest.es/blog/${slug}',
    type: 'article',
    publishedTime: '${new Date().toISOString().split('T')[0]}',
  },
  keywords: ['${keyword}'],
}

export default function Articulo() {
  return (
    <div style={{ minHeight: '100vh', background: '#F6F1E7', color: '#1A1714', fontFamily: SN }}>
      <div style={{ maxWidth: 700, margin: '0 auto', padding: '48px 20px' }}>

        <div style={{ display: 'flex', gap: 16, alignItems: 'center', marginBottom: 48 }}>
          <a href="/" style={{ textDecoration: 'none' }}>
            <span style={{ fontFamily: SE, fontStyle: 'italic', fontSize: 22, color: '#1A1714' }}>
              ia<span style={{ color: '#D9442B' }}>.</span>rest
            </span>
          </a>
          <span style={{ color: '#D8CDB6' }}>/</span>
          <a href="/blog" style={{ fontSize: 13, color: '#6B5F52', textDecoration: 'none' }}>Blog</a>
        </div>

        <div style={{ marginBottom: 40 }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 16 }}>
            <span style={{ fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase' as const, fontWeight: 600, color: '#D9442B', background: '#F4D8CF', padding: '3px 10px', borderRadius: 100 }}>Hostelería</span>
            <span style={{ fontSize: 12, color: '#6B5F52', fontFamily: SM }}>${new Date().toLocaleDateString('es-ES', { month: 'long', year: 'numeric' })} · 8 min lectura</span>
          </div>
          <h1 style={{ fontFamily: SE, fontStyle: 'italic', fontSize: 38, color: '#1A1714', margin: '0 0 20px', lineHeight: 1.15, letterSpacing: '-0.5px' }}>
            ${data.h1.replace(/'/g, "\\'")}
          </h1>
          <p style={{ fontSize: 18, color: '#3A332C', lineHeight: 1.7, margin: 0 }}>
            ${data.intro.replace(/'/g, "\\'")}
          </p>
        </div>

        ${secciones}

        ${faqs ? `<section style={{ marginBottom: 48 }}>
          <h2 style={{ fontFamily: SE, fontSize: 26, color: '#1A1714', margin: '0 0 24px', lineHeight: 1.2 }}>Preguntas frecuentes</h2>
          ${faqs}
        </section>
        <div style={{ borderTop: '1px solid #D8CDB6', margin: '0 0 48px' }} />` : ''}

        <div style={{ background: '#1A1714', borderRadius: 12, padding: '36px 32px', textAlign: 'center', marginBottom: 48 }}>
          <div style={{ fontFamily: SM, fontSize: 11, color: '#D9442B', letterSpacing: '0.12em', marginBottom: 12 }}>PRUEBA SIN COMPROMISO</div>
          <h3 style={{ fontFamily: SE, fontStyle: 'italic', fontSize: 28, color: '#F6F1E7', margin: '0 0 12px' }}>14 días gratis, sin tarjeta</h3>
          <p style={{ fontSize: 14, color: '#D8CDB6', margin: '0 0 24px', lineHeight: 1.6 }}>${(data.cta_texto || 'Prueba ia.rest sin compromiso.').replace(/'/g, "\\'")}</p>
          <a href="https://www.iarest.es/registro" style={{ display: 'inline-block', background: '#D9442B', color: '#fff', padding: '14px 28px', borderRadius: 8, textDecoration: 'none', fontSize: 14, fontWeight: 600 }}>
            Empezar prueba gratis →
          </a>
        </div>

        <div style={{ borderTop: '1px solid #D8CDB6', paddingTop: 24 }}>
          <a href="/blog" style={{ fontSize: 13, color: '#6B5F52', textDecoration: 'none' }}>← Volver al blog</a>
        </div>

      </div>
    </div>
  )
}`
}

async function enviarTelegram(msg: string) {
  if (!TELEGRAM_BOT || !TELEGRAM_CHAT) return
  await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: TELEGRAM_CHAT, text: msg, parse_mode: 'HTML' }),
  })
}

export async function GET(req: NextRequest) {
  // Verificar cron secret
  const auth = req.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}` && process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const supabase = createServerClient()

  try {
    // 1. Obtener keywords de GSC
    let keywords: any[] = []
    try {
      keywords = await getGscKeywords()
    } catch (e) {
      // GSC puede fallar — continuar con keywords predefinidas
    }

    // 2. Elegir keyword objetivo
    const keyword = await elegirKeyword(keywords, ARTICULOS_EXISTENTES)
    if (!keyword) {
      return NextResponse.json({ ok: false, msg: 'Sin keywords candidatas' })
    }

    // Verificar que no existe ya borrador para esta keyword
    const slug = keyword.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
    const { data: existente } = await supabase
      .from('blog_borradores')
      .select('id')
      .eq('slug', slug)
      .maybeSingle()

    if (existente) {
      return NextResponse.json({ ok: false, msg: `Ya existe borrador para: ${slug}` })
    }

    // 3. Generar artículo con Claude
    const { titulo, meta, tsx } = await generarArticulo(keyword)

    // 4. Guardar borrador en Supabase
    const { data: borrador, error } = await supabase
      .from('blog_borradores')
      .insert({ slug, titulo, keyword, meta_description: meta, contenido_tsx: tsx, estado: 'borrador' })
      .select('id')
      .single()

    if (error) throw error

    // 5. Avisar por Telegram
    await enviarTelegram(
      `📝 <b>Nuevo artículo de blog listo para revisar</b>\n\n` +
      `<b>Keyword:</b> ${keyword}\n` +
      `<b>Título:</b> ${titulo}\n` +
      `<b>URL:</b> /blog/${slug}\n\n` +
      `Revisa y publica en:\n` +
      `👉 https://www.iarest.es/super → tab 📝 Blog`
    )

    return NextResponse.json({ ok: true, slug, titulo, id: borrador.id })

  } catch (err: any) {
    await enviarTelegram(`❌ Error generando artículo blog: ${err.message}`)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
