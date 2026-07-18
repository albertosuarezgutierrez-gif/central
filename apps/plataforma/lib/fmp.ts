// Cliente de Financial Modeling Prep (FMP) para la CANTERA del agente trading-analista.
//
// 🔎 REALIDAD DEL PLAN FREE (confirmado 18/07/2026 con la cuenta de Alberto):
//   - Host nuevo `/stable` (las cuentas creadas tras 31/08/2025 no tienen el legacy `/api/v3`).
//   - `/stable/quote` → GRATIS: precio, volumen, marketCap, medias 50/200, máx/mín de 52 semanas.
//   - `/stable/company-screener` → DE PAGO ("Restricted Endpoint"): el universo NO sale de FMP en Free.
//   - `ratios-ttm` / `discounted-cash-flow` (PER/PB/DCF) → probablemente de pago: se piden best-effort
//     y si el plan no los cubre degradan a {} (el agente cae a las señales libres de la cotización).
//
// Por eso en Fase 1 el UNIVERSO lo da IBKR (temas), y FMP ENRIQUECE cada símbolo con señales gratis:
// precio + posición en el rango de 52s (proxy honesto de "por debajo de valor") + tendencia de medias.
//
// Secreto: FMP_API_KEY es una API key de servicio EXTERNO → cae a '' (regla del repo: solo rompe la
// llamada saliente, nunca firma/valida sesiones). Sin key todo degrada a vacío/neutral, no rompe.
import { posicionRango52, tendenciaMedias } from '@central/module-trading'
import type { Candidato, Fundamentales } from '@central/module-trading'

const FMP_KEY = process.env.FMP_API_KEY || ''
const FMP_BASE = process.env.FMP_BASE_URL || 'https://financialmodelingprep.com'
const FMP_VER = process.env.FMP_API_VER || 'stable'   // cuenta nueva = host /stable ('api/v3' = legacy)

export function fmpDisponible(): boolean {
  return FMP_KEY.length > 0
}

// GET {BASE}/{VER}/{path}?...&apikey= — en /stable el símbolo va como query (?symbol=AAPL),
// no en la ruta como en el legacy /api/v3/quote/AAPL.
async function fmpGet<T>(path: string, params: Record<string, string | number | undefined> = {}): Promise<T | null> {
  if (!FMP_KEY) return null
  const url = new URL(`${FMP_BASE}/${FMP_VER}/${path}`)
  for (const [k, v] of Object.entries(params)) if (v !== undefined) url.searchParams.set(k, String(v))
  url.searchParams.set('apikey', FMP_KEY)
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(8000) })
    if (!r.ok) { console.warn('[fmp] HTTP', r.status, path); return null }
    const j = (await r.json()) as unknown
    // Los endpoints de pago responden 200 con { "Error Message": "..." } en vez de un array.
    if (j && !Array.isArray(j) && typeof j === 'object' && 'Error Message' in (j as object)) {
      console.warn('[fmp] restringido', path, (j as { 'Error Message'?: string })['Error Message'])
      return null
    }
    return j as T
  } catch (e) {
    console.warn('[fmp] fallo', path, (e as Error).message)
    return null
  }
}

// ── Mappers PUROS (testeables sin red) ────────────────────────────────────────────────────
type ScreenerRow = { symbol?: string; price?: number; sector?: string; beta?: number; volume?: number; isEtf?: boolean }

// beta → volatilidad anual aproximada: vol_mercado (~18%/año) * beta. Es una proxy para la guarda
// anti-lotería cuando no tenemos la volatilidad histórica exacta del propio nombre.
export function volAnualDeBeta(beta: number | undefined, volMercado = 0.18): number | undefined {
  if (beta === undefined || !Number.isFinite(beta)) return undefined
  return Math.abs(beta) * volMercado
}

export function mapearScreener(rows: ScreenerRow[]): Candidato[] {
  return (rows ?? [])
    .filter(r => r.symbol && typeof r.price === 'number' && !r.isEtf)
    .map(r => ({
      simbolo: r.symbol as string,
      precio: r.price as number,
      sector: r.sector,
      volAnual: volAnualDeBeta(r.beta),
      fuentes: ['screener'],
    }))
}

// La cotización básica del plan Free. Campos confirmados en /stable/quote.
type QuoteRow = {
  symbol?: string; price?: number; volume?: number; marketCap?: number
  priceAvg50?: number; priceAvg200?: number; yearHigh?: number; yearLow?: number
}
export type QuoteFmp = {
  precio: number; volumen?: number; marketCap?: number
  avg50?: number; avg200?: number; yearHigh?: number; yearLow?: number
}

export function mapearQuote(row: QuoteRow | undefined): QuoteFmp | null {
  if (!row || typeof row.price !== 'number') return null
  return {
    precio: row.price,
    volumen: row.volume,
    marketCap: row.marketCap,
    avg50: row.priceAvg50,
    avg200: row.priceAvg200,
    yearHigh: row.yearHigh,
    yearLow: row.yearLow,
  }
}

// Candidato enriquecido SOLO con las señales libres de la cotización (sin fundamentales de pago).
export function candidatoDeQuote(simbolo: string, q: QuoteFmp, sector?: string): Candidato {
  const cand: Candidato = {
    simbolo,
    precio: q.precio,
    sector,
    posRango52: posicionRango52(q.precio, q.yearLow, q.yearHigh),
    tendencia: tendenciaMedias(q.precio, q.avg50, q.avg200),
    fuentes: ['fmp:quote'],
  }
  return cand
}

type RatiosTtm = { peRatioTTM?: number; priceEarningsRatioTTM?: number; priceToEarningsRatioTTM?: number; priceToBookRatioTTM?: number; pbRatioTTM?: number; netProfitMarginTTM?: number }
type DcfRow = { dcf?: number }

export function mapearFundamentales(ratios: RatiosTtm | undefined, dcf: DcfRow | undefined): Fundamentales {
  const per = ratios?.peRatioTTM ?? ratios?.priceEarningsRatioTTM ?? ratios?.priceToEarningsRatioTTM
  const pb = ratios?.priceToBookRatioTTM ?? ratios?.pbRatioTTM
  const f: Fundamentales = {}
  if (typeof per === 'number') f.per = per
  if (typeof pb === 'number') f.pb = pb
  if (typeof ratios?.netProfitMarginTTM === 'number') f.margenNeto = ratios.netProfitMarginTTM
  if (typeof dcf?.dcf === 'number' && dcf.dcf > 0) f.valorRazonable = dcf.dcf
  return f
}

// ── Llamadas (con red) ────────────────────────────────────────────────────────────────────
export type CriteriosFmp = {
  marketCapMoreThan?: number
  priceLowerThan?: number
  priceMoreThan?: number
  volumeMoreThan?: number
  betaLowerThan?: number
  sector?: string
  limit?: number
}

// Universo por parámetros. DE PAGO en el plan Free → devuelve [] si el plan no lo cubre (no rompe).
export async function fmpScreener(c: CriteriosFmp = {}): Promise<Candidato[]> {
  const rows = await fmpGet<ScreenerRow[]>('company-screener', {
    marketCapMoreThan: c.marketCapMoreThan ?? 2_000_000_000,   // evita microcaps de lotería
    priceLowerThan: c.priceLowerThan,
    priceMoreThan: c.priceMoreThan ?? 5,
    volumeMoreThan: c.volumeMoreThan,
    betaLowerThan: c.betaLowerThan,
    sector: c.sector,
    isActivelyTrading: 'true',
    limit: c.limit ?? 50,
  } as Record<string, string | number | undefined>)
  return mapearScreener(rows ?? [])
}

// Cotización de un símbolo (GRATIS). Base del enriquecimiento en el plan Free.
export async function fmpQuote(simbolo: string): Promise<QuoteFmp | null> {
  const q = await fmpGet<QuoteRow[]>('quote', { symbol: simbolo })
  return mapearQuote(q?.[0])
}

// Fundamentales (PER/PB/margen) + valor razonable (DCF). BEST-EFFORT: si el plan no los cubre → {}.
export async function fmpFundamentales(simbolo: string): Promise<Fundamentales> {
  const [ratios, dcf] = await Promise.all([
    fmpGet<RatiosTtm[]>('ratios-ttm', { symbol: simbolo }),
    fmpGet<DcfRow[]>('discounted-cash-flow', { symbol: simbolo }),
  ])
  return mapearFundamentales(ratios?.[0], dcf?.[0])
}

// Enriquece UN símbolo (dado por IBKR/temas) con lo que el plan permita: quote (libre) +
// fundamentales (best-effort). Devuelve null si ni siquiera hay cotización.
export async function fmpEnriquecer(simbolo: string, sector?: string): Promise<Candidato | null> {
  const q = await fmpQuote(simbolo)
  if (!q) return null
  const cand = candidatoDeQuote(simbolo, q, sector)
  const f = await fmpFundamentales(simbolo)
  if (Object.keys(f).length) cand.fundamentales = f
  return cand
}
