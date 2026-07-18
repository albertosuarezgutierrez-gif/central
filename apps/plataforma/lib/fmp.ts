// Cliente de Financial Modeling Prep (FMP) para la CANTERA del agente trading-analista.
// Da el universo (screener) + fundamentales (PER/PB) + valor razonable (DCF) + volumen relativo,
// que el motor de descubrimiento (@central/module-trading) funde y prioriza.
//
// Secreto: FMP_API_KEY es una API key de servicio EXTERNO → cae a '' (regla del repo: solo rompe la
// llamada saliente, nunca firma/valida sesiones). Sin key todo degrada a vacío/neutral, no rompe.
//
// ⚠️ CONFIRMAR rutas/campos contra TU plan de FMP (free usa límites y, según antigüedad de la cuenta,
// el host `/api/v3` o el nuevo `/stable`). Overridable por env FMP_BASE_URL / FMP_API_VER.
import type { Candidato, Fundamentales } from '@central/module-trading'

const FMP_KEY = process.env.FMP_API_KEY || ''
const FMP_BASE = process.env.FMP_BASE_URL || 'https://financialmodelingprep.com'
const FMP_VER = process.env.FMP_API_VER || 'api/v3'   // o 'stable' según plan

export function fmpDisponible(): boolean {
  return FMP_KEY.length > 0
}

async function fmpGet<T>(path: string, params: Record<string, string | number | undefined> = {}): Promise<T | null> {
  if (!FMP_KEY) return null
  const url = new URL(`${FMP_BASE}/${FMP_VER}/${path}`)
  for (const [k, v] of Object.entries(params)) if (v !== undefined) url.searchParams.set(k, String(v))
  url.searchParams.set('apikey', FMP_KEY)
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(8000) })
    if (!r.ok) { console.warn('[fmp] HTTP', r.status, path); return null }
    return (await r.json()) as T
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

type RatiosTtm = { peRatioTTM?: number; priceEarningsRatioTTM?: number; priceToBookRatioTTM?: number; pbRatioTTM?: number; netProfitMarginTTM?: number }
type DcfRow = { dcf?: number }

export function mapearFundamentales(ratios: RatiosTtm | undefined, dcf: DcfRow | undefined): Fundamentales {
  const per = ratios?.peRatioTTM ?? ratios?.priceEarningsRatioTTM
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

// Universo por parámetros. Devuelve candidatos con `fuentes:['screener']`.
export async function fmpScreener(c: CriteriosFmp = {}): Promise<Candidato[]> {
  const rows = await fmpGet<ScreenerRow[]>('stock-screener', {
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

// Fundamentales (PER/PB/margen) + valor razonable (DCF) de un símbolo.
export async function fmpFundamentales(simbolo: string): Promise<Fundamentales> {
  const [ratios, dcf] = await Promise.all([
    fmpGet<RatiosTtm[]>(`ratios-ttm/${simbolo}`),
    fmpGet<DcfRow[]>(`discounted-cash-flow/${simbolo}`),
  ])
  return mapearFundamentales(ratios?.[0], dcf?.[0])
}

// Volumen relativo (rvol) desde la cotización: volumen de hoy / volumen medio.
export async function fmpRvol(simbolo: string): Promise<number | undefined> {
  const q = await fmpGet<{ volume?: number; avgVolume?: number }[]>(`quote/${simbolo}`)
  const row = q?.[0]
  if (!row?.volume || !row?.avgVolume) return undefined
  return row.volume / row.avgVolume
}
