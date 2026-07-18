// Fundamentales GRATIS desde EDGAR (SEC) — API XBRL `companyfacts`. Alternativa sin coste a FMP para
// la pata de CALIDAD/VALOR de la Fase B: alimenta directamente `piotroskiFScore` (2 ejercicios) y el
// ROIC de la fórmula mágica. Mapea los conceptos US-GAAP a los inputs que el módulo ya consume.
// Parseo PURO y testeado; el fetch corre desde el egress de Vercel (la SEC exige User-Agent con
// contacto y bloquea IPs anónimas / el sandbox de las sesiones).
import type { AnioFinanciero } from '@central/module-trading'

const SEC_UA = 'central-trading paper-research (contacto: alberto.suarez.gutierrez@gmail.com)'

type PuntoXbrl = { end: string; val: number; fy?: number; fp?: string; form?: string; filed?: string }
type CompanyFacts = { cik?: number; entityName?: string; facts?: Record<string, Record<string, { units?: Record<string, PuntoXbrl[]> }>> }

// Serie ANUAL (fiscal year → valor) de un concepto, buscándolo en us-gaap y dei. Se queda con los
// valores de 10-K / periodo FY; si un mismo FY aparece varias veces, prevalece el `filed` más reciente.
export function serieAnual(facts: CompanyFacts['facts'], concepto: string): Map<number, number> {
  const out = new Map<number, number>()
  const filedDe = new Map<number, string>()
  const nodos = [facts?.['us-gaap']?.[concepto], facts?.['dei']?.[concepto]].filter(Boolean)
  for (const nodo of nodos) {
    for (const puntos of Object.values(nodo!.units ?? {})) {
      for (const p of puntos) {
        if (p.fy == null || typeof p.val !== 'number') continue
        const esAnual = (p.form === '10-K' || p.form === '10-K/A') && p.fp === 'FY'
        if (!esAnual) continue
        const prev = filedDe.get(p.fy)
        if (prev && p.filed && prev >= p.filed) continue
        out.set(p.fy, p.val)
        if (p.filed) filedDe.set(p.fy, p.filed)
      }
    }
  }
  return out
}

// Primer concepto con dato para ese FY (recorre la lista de alias US-GAAP).
function valorFy(facts: CompanyFacts['facts'], alias: string[], fy: number): number | undefined {
  for (const c of alias) {
    const v = serieAnual(facts, c).get(fy)
    if (v != null) return v
  }
  return undefined
}
const div = (a?: number, b?: number) => (a != null && b != null && b !== 0 ? a / b : 0)

const ALIAS = {
  netIncome: ['NetIncomeLoss'],
  assets: ['Assets'],
  cfo: ['NetCashProvidedByUsedInOperatingActivities', 'NetCashProvidedByUsedInOperatingActivitiesContinuingOperations'],
  deudaLp: ['LongTermDebtNoncurrent', 'LongTermDebt'],
  activoCorriente: ['AssetsCurrent'],
  pasivoCorriente: ['LiabilitiesCurrent'],
  acciones: ['WeightedAverageNumberOfDilutedSharesOutstanding', 'WeightedAverageNumberOfSharesOutstandingBasic', 'CommonStockSharesOutstanding', 'EntityCommonStockSharesOutstanding'],
  ventas: ['Revenues', 'RevenueFromContractWithCustomerExcludingAssessedTax', 'SalesRevenueNet'],
  brutoBeneficio: ['GrossProfit'],
  ebit: ['OperatingIncomeLoss'],
}

function anioDe(facts: CompanyFacts['facts'], fy: number): AnioFinanciero {
  const assets = valorFy(facts, ALIAS.assets, fy)
  const ventas = valorFy(facts, ALIAS.ventas, fy)
  return {
    roa: div(valorFy(facts, ALIAS.netIncome, fy), assets),
    cfo: valorFy(facts, ALIAS.cfo, fy) ?? 0,
    beneficioNeto: valorFy(facts, ALIAS.netIncome, fy) ?? 0,
    ratioDeudaLp: div(valorFy(facts, ALIAS.deudaLp, fy), assets),
    ratioCorriente: div(valorFy(facts, ALIAS.activoCorriente, fy), valorFy(facts, ALIAS.pasivoCorriente, fy)),
    acciones: valorFy(facts, ALIAS.acciones, fy) ?? 0,
    margenBruto: div(valorFy(facts, ALIAS.brutoBeneficio, fy), ventas),
    rotacionActivos: div(ventas, assets),
  }
}

export type FundamentalesEmpresa = {
  simbolo: string
  cik?: string
  anios: Array<{ fy: number; fin: AnioFinanciero }>  // 2 más recientes: [0]=actual, [1]=previo
  ebit?: number             // año más reciente (para earnings yield = EBIT/EV que calcula el consumidor)
  capitalInvertido?: number // activos − pasivo corriente (capital empleado, para ROIC)
  roic?: number             // EBIT / capital invertido
}

// Extrae del companyfacts los DOS ejercicios más recientes en el formato que consume el módulo, más las
// piezas para la fórmula mágica (ROIC ya calculado; earnings yield lo cierra el consumidor con el EV).
export function extraerFundamentales(cf: CompanyFacts, simbolo: string): FundamentalesEmpresa | null {
  const facts = cf.facts
  // FYs que tienen los dos anclas mínimas (beneficio neto + activos), de más nuevo a más viejo.
  const fysConAncla = [...serieAnual(facts, 'NetIncomeLoss').keys()]
    .filter(fy => serieAnual(facts, 'Assets').has(fy))
    .sort((a, b) => b - a)
  if (fysConAncla.length === 0) return null
  const anios = fysConAncla.slice(0, 2).map(fy => ({ fy, fin: anioDe(facts, fy) }))

  const fyUlt = anios[0].fy
  const ebit = valorFy(facts, ALIAS.ebit, fyUlt)
  const capitalInvertido = valorFy(facts, ALIAS.assets, fyUlt) != null
    ? (valorFy(facts, ALIAS.assets, fyUlt)! - (valorFy(facts, ALIAS.pasivoCorriente, fyUlt) ?? 0))
    : undefined
  const roic = ebit != null && capitalInvertido && capitalInvertido !== 0 ? ebit / capitalInvertido : undefined

  return { simbolo, cik: cf.cik != null ? String(cf.cik).padStart(10, '0') : undefined, anios, ebit, capitalInvertido, roic }
}

// Mapa ticker → CIK (10 dígitos) del fichero público company_tickers.json de la SEC.
export function mapaTickers(json: unknown): Map<string, string> {
  const out = new Map<string, string>()
  const filas = json && typeof json === 'object' ? Object.values(json as Record<string, unknown>) : []
  for (const f of filas) {
    const fila = f as { ticker?: string; cik_str?: number | string }
    if (!fila?.ticker || fila.cik_str == null) continue
    out.set(String(fila.ticker).toUpperCase(), String(fila.cik_str).padStart(10, '0'))
  }
  return out
}

async function getJson(url: string, timeoutMs: number): Promise<unknown | null> {
  try {
    const r = await fetch(url, { headers: { 'user-agent': SEC_UA, accept: 'application/json' }, signal: AbortSignal.timeout(timeoutMs) })
    return r.ok ? await r.json() : null
  } catch { return null }
}

let _mapaCache: Map<string, string> | null = null
// Resuelve el CIK de un ticker (cachea el mapa en memoria de la lambda). Best-effort → undefined.
export async function resolverCik(ticker: string, timeoutMs = 8000): Promise<string | undefined> {
  if (!_mapaCache) {
    const json = await getJson('https://www.sec.gov/files/company_tickers.json', timeoutMs)
    if (json) _mapaCache = mapaTickers(json)
  }
  return _mapaCache?.get(ticker.toUpperCase())
}

// Descarga y extrae los fundamentales de un símbolo (resuelve CIK → companyfacts). Best-effort → null.
export async function fundamentalesSimbolo(simbolo: string, timeoutMs = 8000): Promise<FundamentalesEmpresa | null> {
  const cik = await resolverCik(simbolo, timeoutMs)
  if (!cik) return null
  const cf = await getJson(`https://data.sec.gov/api/xbrl/companyfacts/CIK${cik}.json`, timeoutMs)
  return cf ? extraerFundamentales(cf as CompanyFacts, simbolo.toUpperCase()) : null
}
