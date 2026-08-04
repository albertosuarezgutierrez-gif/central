// Precios diarios GRATIS desde Stooq (sin API key). Fuente para la VALIDACIÓN de selección vs SPY sin
// depender del conector IBKR (frágil por el 2FA/reset diario). Stooq da CSV: `Date,Open,High,Low,Close,Volume`.
// Parseo PURO y testeado; el fetch corre desde el egress de Vercel (el sandbox de las sesiones bloquea la salida).

export type PuntoPrecio = { fecha: string; cierre: number }

// Símbolo a formato Stooq: los tickers de EE.UU. llevan sufijo `.us` y el punto de clase pasa a guion
// (BRK.B → brk-b.us). Se respetan los índices `^spx` y lo que ya trae `.us`.
export function stooqSimbolo(simbolo: string): string {
  const s = simbolo.trim().toLowerCase()
  if (!s) return s
  if (s.startsWith('^')) return s            // índice
  if (s.endsWith('.us')) return s            // ya trae mercado
  return `${s.replace(/\./g, '-')}.us`       // BRK.B → brk-b.us
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

const UA = 'Mozilla/5.0 (compatible; central-trading/1.0; paper-research)'

// Descarga los cierres diarios de un símbolo en [desde, hasta]. Best-effort: ante fallo/parseo vacío → [].
export async function cierresStooq(simbolo: string, desde: string, hasta: string, timeoutMs = 8000): Promise<number[]> {
  try {
    const res = await fetch(urlStooq(simbolo, desde, hasta), {
      headers: { 'user-agent': UA },
      signal: AbortSignal.timeout(timeoutMs),
    })
    if (!res.ok) return []
    return cierresDe(parseStooqCsv(await res.text()))
  } catch {
    return []
  }
}

// --- Yahoo Finance: RESPALDO cuando Stooq limita/bloquea la IP de datacenter (pasó en Vercel) ---

// Símbolo a formato Yahoo: el punto de clase pasa a guion (BRK.B → BRK-B); los índices Yahoo usan `^`.
export function yahooSimbolo(simbolo: string): string {
  return simbolo.trim().toUpperCase().replace(/\./g, '-')
}

export function urlYahoo(simbolo: string, desde: string, hasta: string): string {
  const p1 = Math.floor(Date.parse(`${desde}T00:00:00Z`) / 1000) || 0
  const p2 = Math.floor(Date.parse(`${hasta}T00:00:00Z`) / 1000) || Math.floor(Date.now() / 1000)
  return `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooSimbolo(simbolo))}?period1=${p1}&period2=${p2}&interval=1d`
}

// Parsea la respuesta del chart de Yahoo → cierres, filtrando los nulos de días sin cotización.
export function parseYahooChart(json: unknown): number[] {
  const res = (json as { chart?: { result?: Array<{ indicators?: { quote?: Array<{ close?: Array<number | null> }> } }> } })
    ?.chart?.result?.[0]
  const cierres = res?.indicators?.quote?.[0]?.close ?? []
  return cierres.filter((c): c is number => typeof c === 'number' && Number.isFinite(c) && c > 0)
}

export async function cierresYahoo(simbolo: string, desde: string, hasta: string, timeoutMs = 8000): Promise<number[]> {
  try {
    const res = await fetch(urlYahoo(simbolo, desde, hasta), {
      headers: { 'user-agent': UA, accept: 'application/json' },
      signal: AbortSignal.timeout(timeoutMs),
    })
    if (!res.ok) return []
    return parseYahooChart(await res.json())
  } catch {
    return []
  }
}

// Como parseYahooChart pero CON FECHAS (para el punto-en-el-tiempo del backtest): alinea el array
// de timestamps con el de cierres, saltando los nulos de días sin cotización.
export function parseYahooChartPuntos(json: unknown): PuntoPrecio[] {
  const res = (json as { chart?: { result?: Array<{ timestamp?: number[]; indicators?: { quote?: Array<{ close?: Array<number | null> }> } }> } })
    ?.chart?.result?.[0]
  const ts = res?.timestamp ?? []
  const cierres = res?.indicators?.quote?.[0]?.close ?? []
  const out: PuntoPrecio[] = []
  for (let i = 0; i < cierres.length; i++) {
    const c = cierres[i]
    if (typeof c !== 'number' || !Number.isFinite(c) || c <= 0 || typeof ts[i] !== 'number') continue
    out.push({ fecha: new Date(ts[i] * 1000).toISOString().slice(0, 10), cierre: c })
  }
  return out
}

// Cierres diarios con RESPALDO: intenta Stooq (gratis, sin key) y, si no da al menos 2 puntos (Stooq
// limita IPs de datacenter → CSV vacío), cae a Yahoo Finance. Devuelve la primera fuente con datos, o [].
export async function cierresDiarios(simbolo: string, desde: string, hasta: string, timeoutMs = 8000): Promise<number[]> {
  const stooq = await cierresStooq(simbolo, desde, hasta, timeoutMs)
  if (stooq.length >= 2) return stooq
  return cierresYahoo(simbolo, desde, hasta, timeoutMs)
}

// --- Volumen diario (señal 📊 de acumulación/distribución institucional, 20/07/2026) ---
// El CSV de Stooq y el chart de Yahoo SIEMPRE trajeron el volumen — hasta ahora lo tirábamos.
// Es la única huella pública de los fondos entrando/saliendo de una acción (idea de Alberto).

export type PuntoVol = { fecha: string; cierre: number; volumen: number | null }

// Como parseStooqCsv pero conservando el volumen (col 6: Date,Open,High,Low,Close,Volume).
// Volumen no numérico/ausente → null (algunos índices de Stooq no lo traen).
export function parseStooqCsvVol(csv: string): PuntoVol[] {
  const out: PuntoVol[] = []
  for (const linea of csv.split(/\r?\n/)) {
    if (!linea || /^date/i.test(linea)) continue
    const cols = linea.split(',')
    if (cols.length < 5) continue
    const fecha = cols[0].trim()
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) continue
    const cierre = Number(cols[4])
    if (!Number.isFinite(cierre) || cierre <= 0) continue
    const vol = Number(cols[5])
    out.push({ fecha, cierre, volumen: Number.isFinite(vol) && vol > 0 ? vol : null })
  }
  return out
}

// Como parseYahooChartPuntos pero alineando también el array de volúmenes.
export function parseYahooChartVol(json: unknown): PuntoVol[] {
  const res = (json as { chart?: { result?: Array<{ timestamp?: number[]; indicators?: { quote?: Array<{ close?: Array<number | null>; volume?: Array<number | null> }> } }> } })
    ?.chart?.result?.[0]
  const ts = res?.timestamp ?? []
  const cierres = res?.indicators?.quote?.[0]?.close ?? []
  const vols = res?.indicators?.quote?.[0]?.volume ?? []
  const out: PuntoVol[] = []
  for (let i = 0; i < cierres.length; i++) {
    const c = cierres[i]
    if (typeof c !== 'number' || !Number.isFinite(c) || c <= 0 || typeof ts[i] !== 'number') continue
    const v = vols[i]
    out.push({ fecha: new Date(ts[i] * 1000).toISOString().slice(0, 10), cierre: c, volumen: typeof v === 'number' && v > 0 ? v : null })
  }
  return out
}

// Serie diaria cierre+volumen con el respaldo Stooq→Yahoo habitual. Best-effort → [].
export async function puntosDiariosVol(simbolo: string, desde: string, hasta: string, timeoutMs = 8000): Promise<PuntoVol[]> {
  try {
    const res = await fetch(urlStooq(simbolo, desde, hasta), { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(timeoutMs) })
    if (res.ok) {
      const puntos = parseStooqCsvVol(await res.text())
      if (puntos.length >= 2) return puntos
    }
  } catch { /* cae a Yahoo */ }
  try {
    const res = await fetch(urlYahoo(simbolo, desde, hasta), { headers: { 'user-agent': UA, accept: 'application/json' }, signal: AbortSignal.timeout(timeoutMs) })
    if (!res.ok) return []
    return parseYahooChartVol(await res.json())
  } catch { return [] }
}

// Serie diaria CON FECHAS con el mismo respaldo Stooq→Yahoo (para el backtest punto-en-el-tiempo).
export async function puntosDiarios(simbolo: string, desde: string, hasta: string, timeoutMs = 8000): Promise<PuntoPrecio[]> {
  try {
    const res = await fetch(urlStooq(simbolo, desde, hasta), { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(timeoutMs) })
    if (res.ok) {
      const puntos = parseStooqCsv(await res.text())
      if (puntos.length >= 2) return puntos
    }
  } catch { /* cae a Yahoo */ }
  try {
    const res = await fetch(urlYahoo(simbolo, desde, hasta), { headers: { 'user-agent': UA, accept: 'application/json' }, signal: AbortSignal.timeout(timeoutMs) })
    if (!res.ok) return []
    return parseYahooChartPuntos(await res.json())
  } catch { return [] }
}
