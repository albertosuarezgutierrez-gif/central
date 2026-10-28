// Parte PURA del análisis de correos de alertas inmobiliarias (idealista & co.): sin BD, sin red.
// La orquestación (Gmail, IA, inserción, Telegram) vive en `inversion-correos.ts`.

export const CLAVE_PROCESADOS = 'idealista_correos_procesados'
/** Tope de ids de mensaje Gmail recordados (los más recientes). */
export const MAX_PROCESADOS = 500
/** Ventana (días) del cron diario: holgura sobre las 24 h por si un día falla. IMAP `SINCE` es por día. */
export const VENTANA_CRON_DIAS = 2

const PORTAL_DOMAINS = ['idealista.com', 'fotocasa.es', 'kyero.com', 'habitaclia.com', 'pisos.com', 'milanuncios.com', 'boe.es', 'subastas.boe.es']
const SKIP_DOMAINS = ['unsubscribe', 'tracking', 'pixel', 'open.', 'click.', 'mailchimp', 'sendgrid', 'mailtrack', 'mandrillapp', 'list-manage', 'amazonaws.com/track']

/**
 * Id estable de un correo para el dedupe: su `Message-ID` (los UID de IMAP son por buzón).
 * Sin cabecera → `uid:<buzón>:<uid>` (estable mientras no se vacíe el buzón). Formato nuevo:
 * los ids Gmail-API de antes nunca llegaron a guardarse en prod (no había token).
 */
export function idEstable(messageId: string | null | undefined, buzon: string, uid: number): string {
  const m = (messageId ?? '').trim()
  return m || `uid:${buzon}:${uid}`
}

/** Fecha de inicio de la ventana del cron (hoy − días). */
export function desdeCron(ahora: Date = new Date(), dias = VENTANA_CRON_DIAS): Date {
  return new Date(ahora.getTime() - dias * 86_400_000)
}

/** `since` de la ruta manual (YYYY/MM/DD, YYYY-MM-DD, epoch en segundos o ISO) → Date; `null` si no se entiende. */
export function parsearSince(since: string): Date | null {
  const s = String(since ?? '').trim()
  if (!s) return null
  let d: Date
  if (/^\d{9,10}$/.test(s)) d = new Date(Number(s) * 1000)
  else if (/^\d{4}[/-]\d{1,2}[/-]\d{1,2}$/.test(s)) {
    const [y, m, dd] = s.split(/[/-]/).map(Number)
    d = new Date(Date.UTC(y, m - 1, dd))
  } else d = new Date(s)
  return isNaN(d.getTime()) ? null : d
}

/** Cuerpo para la IA: texto plano; si no hay, HTML sin etiquetas (equivale al `extractBody` de la API). */
export function cuerpoParaIA(text: string, html: string): string {
  if (text && text.trim()) return text
  return (html || '')
    .replace(/<(style|script)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ').trim()
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
