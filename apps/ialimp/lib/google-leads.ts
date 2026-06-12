// Recolector de leads desde Google Places API (New).
// Busca empresas por texto+zona y devuelve nombre, teléfono, web y dirección.
// Places NO da email → si la empresa tiene web, intentamos extraerlo (best-effort).
// Requiere GOOGLE_PLACES_API_KEY (clave de Google Cloud con facturación + "Places API (New)").
import { aiComplete } from '@/lib/ai-client'

// Cabeceras de navegador real: muchas webs devuelven 403 a User-Agents "bot".
const BROWSER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'es-ES,es;q=0.9',
}

export interface LeadGoogle {
  place_id: string
  nombre: string
  telefono: string | null
  web: string | null
  direccion: string | null
  email: string | null
}

const PLACES_URL = 'https://places.googleapis.com/v1/places:searchText'

// Búsqueda de texto en Places (New). Devuelve hasta `max` resultados (paginando).
export async function buscarEmpresasGoogle(opts: {
  query: string
  max?: number
}): Promise<{ leads: LeadGoogle[]; error?: string }> {
  const key = process.env.GOOGLE_PLACES_API_KEY
  if (!key) return { leads: [], error: 'Falta GOOGLE_PLACES_API_KEY' }
  const max = Math.min(Math.max(opts.max || 20, 1), 60)

  const leads: LeadGoogle[] = []
  let pageToken: string | undefined
  try {
    while (leads.length < max) {
      const body: any = { textQuery: opts.query, languageCode: 'es', regionCode: 'ES' }
      if (pageToken) body.pageToken = pageToken
      const res = await fetch(PLACES_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': key,
          // Campos que pedimos (el FieldMask es obligatorio en Places New).
          'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.nationalPhoneNumber,places.internationalPhoneNumber,places.websiteUri,nextPageToken',
        },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const txt = await res.text().catch(() => '')
        return { leads, error: `Places API ${res.status}: ${txt.slice(0, 200)}` }
      }
      const data = await res.json()
      for (const p of (data.places || [])) {
        leads.push({
          place_id: p.id,
          nombre: p.displayName?.text || p.displayName || 'Empresa',
          telefono: p.nationalPhoneNumber || p.internationalPhoneNumber || null,
          web: p.websiteUri || null,
          direccion: p.formattedAddress || null,
          email: null,
        })
        if (leads.length >= max) break
      }
      pageToken = data.nextPageToken
      if (!pageToken) break
      // Places exige una pequeña espera antes de usar el nextPageToken.
      await new Promise(r => setTimeout(r, 1500))
    }
    return { leads }
  } catch (e: any) {
    return { leads, error: String(e?.message || e).slice(0, 200) }
  }
}

const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g
const EMAIL_BASURA = /\.(png|jpg|jpeg|gif|webp|svg)$/i

// Rechaza emails que NO son de contacto de la empresa: imágenes, dominios de
// terceros (Google, CDNs, plantillas) y local-parts de relleno ("email@ejemplo").
export function esEmailContacto(e: string): boolean {
  const email = (e || '').toLowerCase().trim()
  if (!email || EMAIL_BASURA.test(email)) return false
  const at = email.indexOf('@')
  if (at < 1) return false
  const local = email.slice(0, at), dom = email.slice(at + 1)
  // Dominios que no son de la empresa (Google, CDNs, ejemplos, sentry…).
  if (/(^|\.)(google\.com|gstatic\.com|googleapis\.com|youtube\.com|schema\.org|w3\.org|wixpress\.com|wix\.com|sentry\.io|godaddy\.com|cloudflare\.com|gravatar\.com|jquery\.com|domain\.com|email\.com|tu-?dominio\.com)$/i.test(dom)) return false
  if (/sentry|example\.|ejemplo\./i.test(dom)) return false
  // Local-parts de relleno / buzones que no se contactan en frío.
  if (/^(email|ejemplo|example|tu|tucorreo|tuemail|your|youremail|nombre|name|usuario|user|test|noreply|no-reply|donotreply|mailer-daemon|postmaster|abuse)$/i.test(local)) return false
  return true
}

// Intenta extraer un email de contacto de la web (home + /contacto). Best-effort.
export async function extraerEmailDeWeb(web: string): Promise<string | null> {
  const candidatas: string[] = []
  try {
    const u = new URL(web)
    candidatas.push(u.origin, u.origin + '/contacto', u.origin + '/contact', u.origin + '/contacto/')
  } catch {
    return null
  }
  for (const url of candidatas.slice(0, 3)) {
    try {
      const ctrl = new AbortController()
      const t = setTimeout(() => ctrl.abort(), 5000)
      const res = await fetch(url, { signal: ctrl.signal, headers: BROWSER_HEADERS })
      clearTimeout(t)
      if (!res.ok) continue
      const html = (await res.text()).slice(0, 500_000)
      const found = (html.match(EMAIL_RE) || [])
        .map(e => e.toLowerCase())
        .filter(esEmailContacto)
      if (found.length) {
        // Preferir un email del mismo dominio que la web.
        const dom = new URL(web).hostname.replace(/^www\./, '')
        return found.find(e => e.endsWith('@' + dom) || e.endsWith('.' + dom)) || found[0]
      }
    } catch { /* siguiente candidata */ }
  }
  return null
}

export interface LeadWeb { empresa: string; email: string | null; telefono: string | null; web: string | null }

// Descarga una URL (un listado/directorio de empresas) y usa la IA de NVIDIA para
// extraer las empresas con sus datos de contacto. Gratis (sin Google Places).
// OJO: solo sirve para páginas servidas como HTML (no Google Maps/JS-only).
export async function analizarListadoWeb(url: string): Promise<{ leads: LeadWeb[]; error?: string }> {
  let html = ''
  try {
    const u = new URL(url)
    if (!/^https?:$/.test(u.protocol)) return { leads: [], error: 'URL no válida' }
    const ctrl = new AbortController()
    const t = setTimeout(() => ctrl.abort(), 9000)
    const res = await fetch(u.toString(), { signal: ctrl.signal, headers: BROWSER_HEADERS })
    clearTimeout(t)
    if (!res.ok) return { leads: [], error: `La web respondió ${res.status}` }
    html = await res.text()
  } catch (e: any) {
    return { leads: [], error: 'No se pudo descargar la página: ' + String(e?.message || e).slice(0, 120) }
  }

  // Conservar mailto/tel antes de limpiar etiquetas (la IA los aprovecha).
  const mailtos = Array.from(html.matchAll(/mailto:([^"'>\s?]+)/gi)).map(m => m[1]).slice(0, 50).join(' ')
  const texto = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ').trim()
    .slice(0, 12000)

  const prompt = `Del siguiente contenido de una página web que lista empresas (probablemente de ` +
    `limpieza), extrae TODAS las empresas con sus datos de contacto. Devuelve SOLO un array JSON ` +
    `válido, sin texto adicional, con objetos {"empresa","email","telefono","web"}. Si un dato no ` +
    `aparece, ponlo null. No inventes datos.\n\nEmails en enlaces mailto: ${mailtos || 'ninguno'}\n\n` +
    `CONTENIDO:\n${texto}`
  let out = ''
  try { out = await aiComplete(prompt, { maxTokens: 20000 }) } catch (e: any) { return { leads: [], error: 'IA: ' + String(e?.message || e).slice(0, 120) } }

  const a = out.indexOf('['), b = out.lastIndexOf(']')
  if (a < 0 || b < 0) return { leads: [], error: 'La IA no devolvió una lista' }
  let arr: any[]
  try { arr = JSON.parse(out.slice(a, b + 1)) } catch { return { leads: [], error: 'Respuesta de la IA no parseable' } }

  const leads: LeadWeb[] = (Array.isArray(arr) ? arr : [])
    .map(o => ({
      empresa: String(o?.empresa || o?.nombre || '').trim(),
      email: o?.email && esEmailContacto(String(o.email)) ? String(o.email).trim().toLowerCase() : null,
      telefono: o?.telefono ? String(o.telefono).trim() : null,
      web: o?.web ? String(o.web).trim() : null,
    }))
    .filter(l => l.empresa && (!l.email || /.+@.+\..+/.test(l.email)))
  return { leads }
}

// ── Apify: scraper de Google Maps (servidor, sin tarjeta de Google) ──────────
// Requiere APIFY_TOKEN. El actor de Maps tarda 1-3 min → modelo asíncrono:
// apifyStart() lanza el run y devuelve runId; apifyResults(runId) consulta el
// estado y, cuando termina, devuelve los leads.
const APIFY = 'https://api.apify.com/v2'
const APIFY_ACTOR = process.env.APIFY_ACTOR || 'compass~crawler-google-places'

export async function apifyStart(query: string, max: number): Promise<{ runId?: string; error?: string }> {
  const token = process.env.APIFY_TOKEN
  if (!token) return { error: 'Falta APIFY_TOKEN' }
  try {
    const res = await fetch(`${APIFY}/acts/${APIFY_ACTOR}/runs?token=${token}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        searchStringsArray: [query],
        maxCrawledPlacesPerSearch: Math.min(Math.max(max, 1), 120),
        language: 'es', countryCode: 'es', skipClosedPlaces: false,
      }),
    })
    if (!res.ok) return { error: `Apify ${res.status}: ${(await res.text()).slice(0, 150)}` }
    const d = await res.json()
    return { runId: d?.data?.id }
  } catch (e: any) { return { error: String(e?.message || e).slice(0, 150) } }
}

export async function apifyResults(runId: string): Promise<{ status: string; leads?: LeadWeb[]; error?: string }> {
  const token = process.env.APIFY_TOKEN
  if (!token) return { status: 'ERROR', error: 'Falta APIFY_TOKEN' }
  try {
    const r = await fetch(`${APIFY}/actor-runs/${runId}?token=${token}`)
    if (!r.ok) return { status: 'ERROR', error: `Apify ${r.status}` }
    const d = await r.json()
    const status: string = d?.data?.status || 'UNKNOWN'
    if (status !== 'SUCCEEDED') return { status } // READY|RUNNING|... → seguir esperando
    const dsId = d?.data?.defaultDatasetId
    const ir = await fetch(`${APIFY}/datasets/${dsId}/items?token=${token}&clean=true&format=json`)
    const items: any[] = await ir.json().catch(() => [])
    const leads: LeadWeb[] = (Array.isArray(items) ? items : []).map(it => ({
      empresa: String(it?.title || it?.name || '').trim(),
      email: Array.isArray(it?.emails) && it.emails[0] && esEmailContacto(String(it.emails[0])) ? String(it.emails[0]).trim().toLowerCase() : null,
      telefono: it?.phoneUnformatted || it?.phone || null,
      web: it?.website || it?.url || null,
    })).filter(l => l.empresa)
    return { status, leads }
  } catch (e: any) { return { status: 'ERROR', error: String(e?.message || e).slice(0, 150) } }
}
