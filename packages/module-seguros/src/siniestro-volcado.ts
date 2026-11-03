// Volcado del hilo de la intranet de la compañía (texto pegado) → mensajes del expediente. PURO, sin IA.
// Cabeceras tipo `PERITO-28-09-2026 18:40` o `UE7234 (JC940-940-021)-26-10-2026 17:13` (hora de Madrid).

export type RolEmisorVolcado = 'perito' | 'tramitador' | 'compania'

export type TrozoVolcado = {
  emisor: string
  rol: RolEmisorVolcado
  /** Instante ISO (UTC) de la cabecera, o `null` si el volcado no traía fecha. */
  fechaOriginal: string | null
  texto: string
}

const RE_CABECERA = /^\s*(.+?)-(\d{2})-(\d{2})-(\d{4})\s+(\d{2}):(\d{2})\s*$/

/** Offset (minutos) de Madrid respecto a UTC en un instante dado. */
function offsetMadrid(utcMs: number): number {
  const p = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Madrid', hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(new Date(utcMs))
  const g = (t: string) => Number(p.find((x) => x.type === t)?.value)
  const comoUtc = Date.UTC(g('year'), g('month') - 1, g('day'), g('hour'), g('minute'), g('second'))
  return Math.round((comoUtc - Math.floor(utcMs / 1000) * 1000) / 60000)
}

/** Hora de pared de Madrid → instante ISO UTC. `null` si la fecha no existe. */
function madridAIso(d: number, mo: number, y: number, h: number, mi: number): string | null {
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59) return null
  const pared = Date.UTC(y, mo - 1, d, h, mi)
  if (new Date(pared).getUTCDate() !== d) return null
  let utc = pared - offsetMadrid(pared) * 60000
  utc = pared - offsetMadrid(utc) * 60000
  return new Date(utc).toISOString()
}

export function rolDeEmisor(emisor: string): RolEmisorVolcado {
  if (/perito/i.test(emisor)) return 'perito'
  if (/^\s*[A-Z]{1,3}\d{3,}\b/i.test(emisor)) return 'tramitador'
  return 'compania'
}

/** Trocea un volcado por sus cabeceras. Sin cabeceras → un solo trozo con `fechaOriginal: null`. Texto vacío → `[]`. */
export function trocearVolcadoIntranet(texto: string): TrozoVolcado[] {
  const lineas = String(texto ?? '').replace(/\r\n?/g, '\n').split('\n')
  type Corte = { i: number; emisor: string; fecha: string | null }
  const cortes: Corte[] = []
  lineas.forEach((l, i) => {
    const m = RE_CABECERA.exec(l)
    if (!m) return
    const fecha = madridAIso(Number(m[2]), Number(m[3]), Number(m[4]), Number(m[5]), Number(m[6]))
    if (fecha === null) return
    cortes.push({ i, emisor: m[1].trim(), fecha })
  })
  const completo = lineas.join('\n').trim()
  if (cortes.length === 0) return completo === '' ? [] : [{ emisor: '', rol: 'compania', fechaOriginal: null, texto: completo }]
  const out: TrozoVolcado[] = []
  const previo = lineas.slice(0, cortes[0].i).join('\n').trim()
  if (previo !== '') out.push({ emisor: '', rol: 'compania', fechaOriginal: null, texto: previo })
  cortes.forEach((c, k) => {
    const fin = k + 1 < cortes.length ? cortes[k + 1].i : lineas.length
    const cuerpo = lineas.slice(c.i + 1, fin).join('\n').trim()
    if (cuerpo === '') return
    out.push({ emisor: c.emisor, rol: rolDeEmisor(c.emisor), fechaOriginal: c.fecha, texto: cuerpo })
  })
  return out
}

// ─── Informe previo del perito ───────────────────────────────────────────────

export type FichaInformePerito = {
  numeroInforme: number | null
  /** `YYYY-MM-DD`. */
  fechaGestion: string | null
  fechaProxGestion: string | null
  importeCubierto: number | null
  importeNoCubierto: number | null
  origenCausas: string | null
  afectados: number | null
}

/** «4.000,00» → 4000. `null` si no es un importe español. */
export function importeEspanol(s: string | null | undefined): number | null {
  if (typeof s !== 'string') return null
  const t = s.trim()
  if (!/^-?\d{1,3}(\.\d{3})*(,\d+)?$|^-?\d+(,\d+)?$/.test(t)) return null
  const n = Number(t.replace(/\./g, '').replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

function fechaPunto(s: string | undefined): string | null {
  const m = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec((s ?? '').trim())
  if (!m) return null
  const d = new Date(Date.UTC(Number(m[3]), Number(m[2]) - 1, Number(m[1])))
  return d.getUTCDate() === Number(m[1]) && d.getUTCMonth() === Number(m[2]) - 1 ? `${m[3]}-${m[2]}-${m[1]}` : null
}

function campo(texto: string, etiqueta: RegExp): string | null {
  const m = new RegExp(`^[ \\t]*${etiqueta.source}[ \\t]*:[ \\t]*(.*)$`, 'im').exec(texto)
  const v = m?.[1]?.trim() ?? ''
  return v === '' ? null : v
}

/** Ficha de un «INFORME PREVIO PERITO». `null` si el texto no es un informe. Campo ausente = `null` (nunca 0). */
export function fichaInformePerito(texto: string): FichaInformePerito | null {
  const t = String(texto ?? '').replace(/\r\n?/g, '\n')
  if (!/INFORME\s+PREVIO\s+PERITO/i.test(t) && !/^[ \t]*N[uú]mero de Informe[ \t]*:/im.test(t)) return null
  const entero = (v: string | null) => (v !== null && /^\d+$/.test(v) ? Number(v) : null)
  let origen: string | null = null
  const mo = /^[ \t]*Origen, causas y circunstancias[ \t]*:[ \t]*\n?([\s\S]*?)(?=^[ \t]*N[uú]mero de Afectados|\n[ \t]*={3,}|(?![\s\S]))/im.exec(t)
  if (mo) origen = mo[1].trim() || null
  return {
    numeroInforme: entero(campo(t, /N[uú]mero de Informe/)),
    fechaGestion: fechaPunto(campo(t, /Fecha de Gesti[oó]n/) ?? undefined),
    fechaProxGestion: fechaPunto(campo(t, /Fecha Prox\.? Gesti[oó]n/) ?? undefined),
    importeCubierto: importeEspanol(campo(t, /Importe da[nñ]os seg[uú]n garant[ií]as p[oó]liza/)),
    importeNoCubierto: importeEspanol(campo(t, /Importe aproximado total da[nñ]os no cubiertos/)),
    origenCausas: origen,
    afectados: entero(campo(t, /N[uú]mero de Afectados/)),
  }
}

// ─── Huella (no duplicar un volcado pegado dos veces) ────────────────────────

function cyrb53(s: string, semilla: number): number {
  let h1 = 0xdeadbeef ^ semilla
  let h2 = 0x41c6ce57 ^ semilla
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i)
    h1 = Math.imul(h1 ^ c, 2654435761)
    h2 = Math.imul(h2 ^ c, 1597334677)
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909)
  return 4294967296 * (2097151 & h2) + (h1 >>> 0)
}

/** Huella estable del mensaje: texto con los espacios normalizados + fecha original. Pura (sin `node:crypto`). */
export function huellaMensaje(texto: string, fechaOriginal: string | null | undefined): string {
  const base = `${String(texto ?? '').replace(/\s+/g, ' ').trim()}|${fechaOriginal ?? ''}`
  return `${cyrb53(base, 0).toString(16).padStart(14, '0')}${cyrb53(base, 7).toString(16).padStart(14, '0')}`
}
