export const dynamic = 'force-dynamic'
// La función de Vercel se corta a ~60s en este proyecto (maxDuration=300 NO se
// respeta — el plan lo capa). El modelo grande (llama-3.3-70b) tardaba >60s en
// generar el artículo → Vercel mataba la función con un 504 (texto plano, no JSON).
// Por eso la generación usa el modelo RÁPIDO 8B (ver generarTexto), que cabe en la
// ventana. Dejamos maxDuration=300 como margen por si el plan llegara a permitirlo.
export const maxDuration = 300

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { callAI, cleanJSON } from '@/lib/ai-client'

const CLIENT_ID     = process.env.GOOGLE_CLIENT_ID || ''
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || ''
const GSC_SITE      = 'https://www.iarest.es/'
const TELEGRAM_BOT  = process.env.TELEGRAM_BOT_TOKEN || ''
const TELEGRAM_CHAT = process.env.TELEGRAM_CHAT_ID || ''
const GH_PAT        = process.env.GH_PAT || ''
const GH_REPO       = 'albertosuarezgutierrez-gif/central'

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

// El modelo grande (70b) a 4096 tokens tardaba >60s y Vercel cortaba la función con
// un 504 (ni siquiera saltaba nuestro timeout interno). Generamos con el modelo
// RÁPIDO 8B (≈30-40s para el artículo) y un timeout interno de 45s que salta ANTES
// del corte de Vercel (~60s): así un fallo devuelve JSON limpio en vez de un 504.
// Sin reintento: no hay presupuesto de tiempo para un 2º intento dentro de la ventana.
const BLOG_MODELO = 'meta/llama-3.1-8b-instruct'

// Techo de tokens del artículo. El artículo COMPLETO (JSON + HTML) debe caber aquí:
// antes el prompt pedía ~1800 palabras con este mismo techo → el JSON se cortaba a la
// mitad (string sin cerrar) y `JSON.parse` reventaba. Ahora el prompt pide ~950 palabras,
// que caben con holgura y el modelo cierra el JSON de forma natural. El techo se deja algo
// por encima del final natural (~2900) como colchón para no clipar el CTA; el 8B no rellena
// hasta el máximo, así que no penaliza el tiempo.
const BLOG_MAX_TOKENS = 3200

async function generarTexto(system: string, prompt: string): Promise<string> {
  return callAI(system, prompt, BLOG_MAX_TOKENS, 45_000, true, BLOG_MODELO)
}

// ── Parseo robusto del JSON del modelo ────────────────────────────────────────
// Los modelos 8B fallan de dos formas típicas al emitir un artículo largo como JSON:
//   (1) truncan al llegar al techo de tokens → objeto/array sin cerrar, y
//   (2) meten caracteres de control CRUDOS (saltos de línea, tabs) o comillas sin
//       escapar dentro de los strings de HTML → `JSON.parse` los rechaza.
// `cleanJSON` (núcleo compartido) ya quita fences y prosa alrededor; aquí añadimos
// dos redes por encima: escapar los controles crudos dentro de cadenas y, si aun así
// el JSON está truncado, cerrar los contenedores abiertos tras el último valor COMPLETO
// (descartando la última propiedad a medias). Devuelve el objeto o `null` (nunca lanza).
function parsearJSONModelo(raw: string): any {
  const limpio = cleanJSON(raw)
  try { return JSON.parse(limpio) } catch { /* sigue */ }
  const escapado = escaparControlEnCadenas(limpio)
  try { return JSON.parse(escapado) } catch { /* sigue */ }
  const cerrado = cerrarTruncado(escapado)
  if (cerrado) { try { return JSON.parse(cerrado) } catch { /* sigue */ } }
  return null
}

// Escapa \n \r \t y demás controles (< 0x20) que aparezcan DENTRO de una cadena JSON
// (fuera de cadenas se dejan tal cual). Respeta las secuencias ya escapadas.
function escaparControlEnCadenas(s: string): string {
  let out = '', inString = false, escaped = false
  for (let i = 0; i < s.length; i++) {
    const c = s[i]
    if (inString) {
      if (escaped) { out += c; escaped = false; continue }
      if (c === '\\') { out += c; escaped = true; continue }
      if (c === '"') { out += c; inString = false; continue }
      const code = c.charCodeAt(0)
      if (c === '\n') { out += '\\n'; continue }
      if (c === '\r') { out += '\\r'; continue }
      if (c === '\t') { out += '\\t'; continue }
      if (code < 0x20) { out += '\\u' + code.toString(16).padStart(4, '0'); continue }
      out += c; continue
    }
    if (c === '"') { inString = true; out += c; continue }
    out += c
  }
  return out
}

// Repara un JSON truncado: recorre distinguiendo clave/valor y contenedores, recuerda el
// último punto donde un VALOR quedó completo, recorta ahí y cierra los contenedores que
// seguían abiertos. Así un artículo cortado a media sección devuelve un borrador válido
// (con las secciones completas) en vez de un fallo duro. Devuelve null si no hay nada útil.
function cerrarTruncado(s: string): string | null {
  let inString = false, escaped = false, expectValue = false, corteSeguro = -1
  const pila: { cierre: '}' | ']'; obj: boolean }[] = []
  let pilaSegura: ('}' | ']')[] = []
  const marcar = (idx: number) => { corteSeguro = idx; pilaSegura = pila.map(p => p.cierre) }
  for (let i = 0; i < s.length; i++) {
    const c = s[i]
    if (inString) {
      if (escaped) escaped = false
      else if (c === '\\') escaped = true
      else if (c === '"') {
        inString = false
        const dentro = pila[pila.length - 1]
        if (!dentro) marcar(i + 1)                       // string de nivel superior
        else if (!dentro.obj) marcar(i + 1)              // elemento de array
        else if (expectValue) { marcar(i + 1); expectValue = false } // valor de objeto
        // si no: era una CLAVE de objeto → no es punto seguro
      }
      continue
    }
    if (c === '"') { inString = true; continue }
    else if (c === '{') { pila.push({ cierre: '}', obj: true }); expectValue = false }
    else if (c === '[') { pila.push({ cierre: ']', obj: false }) }
    else if (c === '}' || c === ']') {
      pila.pop(); marcar(i + 1)
      const padre = pila[pila.length - 1]
      if (padre && padre.obj) expectValue = false
    }
    else if (c === ':') { expectValue = true }
    else if (c === ',') { const d = pila[pila.length - 1]; if (d && d.obj) expectValue = false }
  }
  if (corteSeguro === -1) return null
  return s.slice(0, corteSeguro) + pilaSegura.slice().reverse().join('')
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
- Longitud: ~950 palabras en total (4 secciones + 3 FAQ). Prioriza terminar el JSON
  completo antes que alargarte: un artículo entero y cerrado es mejor que uno largo a medias.

FORMATO DEL JSON (crítico para que no falle el parseo):
- Responde SOLO con el JSON. Nada de markdown, backticks ni texto antes o después.
- En el HTML de "contenido" usa comillas SIMPLES para los atributos (p. ej. <a href='...'>),
  nunca comillas dobles, y no metas saltos de línea dentro de los valores del JSON.

Estructura:
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

  // Modelo rápido 8B + timeout 45s (ver generarTexto): cabe en la ventana de ~60s
  // de Vercel, que con el modelo grande se agotaba (504).
  const raw = await generarTexto(
    'Eres un experto en SEO y copywriting para hostelería española. Respondes SOLO con un JSON válido, sin markdown ni backticks.',
    prompt
  )

  // Parseo robusto: cleanJSON (fences/prosa) + escape de controles crudos + reparación
  // de truncamiento. Si aun así no hay objeto, el error incluye longitud + cola (no solo
  // el inicio) para poder diagnosticar futuros fallos.
  const parsed = parsearJSONModelo(raw)
  if (!parsed || typeof parsed !== 'object') {
    throw new Error(
      `No se pudo parsear JSON del artículo (len=${raw.length}). ` +
      `Inicio: ${raw.slice(0, 150)} … Cola: ${raw.slice(-150)}`
    )
  }
  // Campos mínimos imprescindibles para un borrador utilizable.
  if (!parsed.titulo || !parsed.meta_description) {
    throw new Error(
      `JSON del artículo sin campos mínimos (titulo/meta_description). ` +
      `Claves: ${Object.keys(parsed).join(', ')}`
    )
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
  // Defensivo: una reparación de truncamiento puede dejar una sección/FAQ a medias
  // (p. ej. h2 presente pero sin contenido). Filtramos las incompletas y usamos
  // fallbacks en los campos de cabecera para no reventar con `undefined.replace`.
  const esc = (v: any) => String(v ?? '').replace(/'/g, "\\'")

  const secciones = (Array.isArray(data.secciones) ? data.secciones : [])
    .filter((s: any) => s && s.h2 && s.contenido)
    .map((s: any) => `
        <section style={{ marginBottom: 48 }}>
          <h2 style={{ fontFamily: SE, fontSize: 26, color: '#1A1714', margin: '0 0 16px', lineHeight: 1.2 }}>
            ${esc(s.h2)}
          </h2>
          <div style={{ fontSize: 15, lineHeight: 1.75, color: '#3A332C' }}
            dangerouslySetInnerHTML={{ __html: \`${String(s.contenido).replace(/`/g, '\\`').replace(/\$/g, '\\$')}\` }}
          />
        </section>
        <div style={{ borderTop: '1px solid #D8CDB6', margin: '0 0 48px' }} />`
  ).join('\n')

  const faqs = (Array.isArray(data.faq) ? data.faq : [])
    .filter((f: any) => f && f.pregunta && f.respuesta)
    .map((f: any) => `
            <div style={{ marginBottom: 16, padding: '18px 20px', background: '#EFE7D6', border: '1px solid #D8CDB6', borderRadius: 8 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#1A1714', marginBottom: 8 }}>${esc(f.pregunta)}</div>
              <div style={{ fontSize: 13, color: '#6B5F52', lineHeight: 1.65 }}>${esc(f.respuesta)}</div>
            </div>`
  ).join('\n')

  return `import { SE, SN, SM } from '@/lib/colors'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: '${esc(data.titulo)}',
  description: '${esc(data.meta_description)}',
  alternates: { canonical: 'https://www.iarest.es/blog/${slug}' },
  openGraph: {
    title: '${esc(data.titulo)}',
    description: '${esc(data.meta_description)}',
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
            ${esc(data.h1 || data.titulo)}
          </h1>
          <p style={{ fontSize: 18, color: '#3A332C', lineHeight: 1.7, margin: 0 }}>
            ${esc(data.intro)}
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
  // Aceptar llamadas del cron de Vercel O de super_admin
  const auth = req.headers.get('authorization')
  const sessionHeader = req.headers.get('x-ia-session')
  let isSuperAdmin = false
  if (sessionHeader) {
    try { const s = JSON.parse(sessionHeader); isSuperAdmin = s?.rol === 'super_admin' } catch {}
  }
  const isCron = auth === `Bearer ${process.env.CRON_SECRET}`
  if (!isCron && !isSuperAdmin) {
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
