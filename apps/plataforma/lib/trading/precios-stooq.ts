// Precios diarios GRATIS desde Stooq (sin API key). Fuente para la VALIDACIÓN de selección vs SPY sin
// depender del conector IBKR (frágil por el 2FA/reset diario). Stooq da CSV: `Date,Open,High,Low,Close,Volume`.
// Parseo PURO y testeado; el fetch corre desde el egress de Vercel (el sandbox de las sesiones bloquea la salida).

export type PuntoPrecio = { fecha: string; cierre: number }

// Símbolo a formato Stooq: los tickers de EE.UU. llevan sufijo `.us`. Si ya trae punto (mercado
// explícito, p.ej. `spy.us` o índices `^spx`), se respeta.
export function stooqSimbolo(simbolo: string): string {
  const s = simbolo.trim().toLowerCase()
  if (!s) return s
  if (s.includes('.') || s.startsWith('^')) return s
  return `${s}.us`
}

// YYYY-MM-DD | Date → YYYYMMDD (formato de Stooq d1/d2). Devuelve '' si no parece fecha.
export function aStooqFecha(fecha: string): string {
  const m = fecha.trim().match(/^(\d{4})-(\d{2})-(\d{2})/)
  return m ? `${m[1]}${m[2]}${m[3]}` : ''
}

export function urlStooq(simbolo: string, desde: string, hasta: string): string {
  const s = encodeURIComponent(stooqSimbolo(simbolo))
  const d1 = aStooqFecha(desde)
  const d2 = aStooqFecha(hasta)
  const rango = d1 && d2 ? `&d1=${d1}&d2=${d2}` : ''
  return `https://stooq.com/q/d/l/?s=${s}${rango}&i=d`
}

// Parsea el CSV de Stooq → serie ordenada por fecha. Defensivo: ignora cabecera, líneas vacías,
// "N/D"/"No data" y filas con cierre no numérico. Stooq ya devuelve las filas en orden ascendente.
export function parseStooqCsv(csv: string): PuntoPrecio[] {
  const out: PuntoPrecio[] = []
  const lineas = csv.split(/\r?\n/)
  for (const linea of lineas) {
    if (!linea || /^date/i.test(linea)) continue           // cabecera
    const cols = linea.split(',')
    if (cols.length < 5) continue                           // necesitamos al menos Date..Close
    const fecha = cols[0].trim()
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) continue         // "No data"/basura
    const cierre = Number(cols[4])
    if (!Number.isFinite(cierre) || cierre <= 0) continue
    out.push({ fecha, cierre })
  }
  return out
}

// Solo los cierres (para retornos). Mantiene el orden temporal.
export function cierresDe(puntos: PuntoPrecio[]): number[] {
  return puntos.map(p => p.cierre)
}

// Descarga los cierres diarios de un símbolo en [desde, hasta]. Best-effort: ante fallo/parseo vacío → [].
export async function cierresStooq(simbolo: string, desde: string, hasta: string, timeoutMs = 8000): Promise<number[]> {
  try {
    const res = await fetch(urlStooq(simbolo, desde, hasta), {
      headers: { 'user-agent': 'Mozilla/5.0 (compatible; central-trading/1.0; paper-research)' },
      signal: AbortSignal.timeout(timeoutMs),
    })
    if (!res.ok) return []
    return cierresDe(parseStooqCsv(await res.text()))
  } catch {
    return []
  }
}
