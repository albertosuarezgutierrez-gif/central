// Parte PURA del análisis de correos de alertas inmobiliarias (idealista & co.): sin BD, sin red.
// La orquestación (Gmail, IA, inserción, Telegram) vive en `inversion-correos.ts`.

export const CLAVE_PROCESADOS = 'idealista_correos_procesados'
/** Tope de ids de mensaje Gmail recordados (los más recientes). */
export const MAX_PROCESADOS = 500
/** Ventana de Gmail del cron diario: holgura sobre las 24 h por si un día falla. */
export const VENTANA_CRON = 'newer_than:2d'

const PORTAL_DOMAINS = ['idealista.com', 'fotocasa.es', 'kyero.com', 'habitaclia.com', 'pisos.com', 'milanuncios.com', 'boe.es', 'subastas.boe.es']
const SKIP_DOMAINS = ['unsubscribe', 'tracking', 'pixel', 'open.', 'click.', 'mailchimp', 'sendgrid', 'mailtrack', 'mandrillapp', 'list-manage', 'amazonaws.com/track']

/** Consulta de Gmail: etiqueta + filtro temporal (`after:` de la UI o `newer_than:` del cron). */
export function consultaGmail(label: string, filtroTemporal: string): string {
  return `label:${label} ${filtroTemporal}`.trim()
}

/** Ids que aún no se han analizado con IA, sin repetidos y conservando el orden. */
export function filtrarNoProcesados(ids: string[], procesados: Iterable<string>): string[] {
  const vistos = new Set(procesados)
  const out: string[] = []
  for (const id of ids) {
    if (!id || vistos.has(id)) continue
    vistos.add(id)
    out.push(id)
  }
  return out
}

/** Añade `nuevos` al final y recorta a los `max` más recientes (sin duplicados). */
export function fusionarProcesados(previos: string[], nuevos: string[], max = MAX_PROCESADOS): string[] {
  const sinRepetir = [...previos.filter((x) => !nuevos.includes(x)), ...nuevos]
  return sinRepetir.length > max ? sinRepetir.slice(sinRepetir.length - max) : sinRepetir
}

function decodeBase64Url(data: string): string {
  return Buffer.from(data.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf-8')
}

export function extractBody(payload: any, depth = 0): string {
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

export function extractAllLinks(text: string): string[] {
  const raw = (text.match(/https?:\/\/[^\s"'<>)\]]+/gi) || []).map((u) => u.replace(/[).,;>"'\]]+$/, ''))
  const clean = [...new Set(raw)].filter((u) => !SKIP_DOMAINS.some((s) => u.toLowerCase().includes(s)))
  const portals = clean.filter((u) => PORTAL_DOMAINS.some((d) => u.includes(d)))
  const others = clean.filter((u) => !PORTAL_DOMAINS.some((d) => u.includes(d)))
  return [...portals, ...others].slice(0, 10)
}

export function extractPortalLinks(text: string): string[] {
  return extractAllLinks(text).filter((u) => PORTAL_DOMAINS.some((d) => u.includes(d))).slice(0, 5)
}

export function extractPhone(text: string): string | null {
  const m = text.match(/(?:\+34|0034)?\s*[679]\d{2}[\s.-]?\d{3}[\s.-]?\d{3}/)
  if (!m) return null
  return m[0].replace(/[\s.-]/g, '').replace(/^0034/, '+34')
}
