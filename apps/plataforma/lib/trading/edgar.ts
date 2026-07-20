// Fundamentales GRATIS desde EDGAR (SEC) — API XBRL `companyfacts`. Alternativa sin coste a FMP para
// la pata de CALIDAD/VALOR de la Fase B: alimenta directamente `piotroskiFScore` (2 ejercicios) y el
// ROIC de la fórmula mágica. Mapea los conceptos US-GAAP a los inputs que el módulo ya consume.
// Parseo PURO y testeado; el fetch corre desde el egress de Vercel (la SEC exige User-Agent con
// contacto y bloquea IPs anónimas / el sandbox de las sesiones).
import type { AnioFinanciero } from '@central/module-trading'

const SEC_UA = 'central-trading paper-research (contacto: alberto.suarez.gutierrez@gmail.com)'

type PuntoXbrl = { end: string; val: number; fy?: number; fp?: string; form?: string; filed?: string }
export type CompanyFacts = { cik?: number; entityName?: string; facts?: Record<string, Record<string, { units?: Record<string, PuntoXbrl[]> }>> }

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
  caja: ['CashAndCashEquivalentsAtCarryingValue'],
  activoCorriente: ['AssetsCurrent'],
  pasivoCorriente: ['LiabilitiesCurrent'],
  acciones: ['WeightedAverageNumberOfDilutedSharesOutstanding', 'WeightedAverageNumberOfSharesOutstandingBasic', 'CommonStockSharesOutstanding', 'EntityCommonStockSharesOutstanding'],
  ventas: ['Revenues', 'RevenueFromContractWithCustomerExcludingAssessedTax', 'SalesRevenueNet'],
  brutoBeneficio: ['GrossProfit'],
  ebit: ['OperatingIncomeLoss'],
  capex: ['PaymentsToAcquirePropertyPlantAndEquipment', 'PaymentsToAcquireProductiveAssets'],
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
  // Para EV y mktCap (radar): valores ABSOLUTOS del FY más reciente.
  deudaLp?: number
  caja?: number
  margenNeto?: number   // beneficio neto / ventas
  acciones?: number     // = anios[0].fin.acciones (comodidad del consumidor)
  capex?: number        // FY más reciente (para FCF = CFO − capex; el yield lo cierra el consumidor con mktCap)
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

  const deudaLp = valorFy(facts, ALIAS.deudaLp, fyUlt)
  const caja = valorFy(facts, ALIAS.caja, fyUlt)
  const ventas = valorFy(facts, ALIAS.ventas, fyUlt)
  const neto = valorFy(facts, ALIAS.netIncome, fyUlt)
  const margenNeto = ventas ? div(neto, ventas) : undefined
  const capex = valorFy(facts, ALIAS.capex, fyUlt)
  return { simbolo, cik: cf.cik != null ? String(cf.cik).padStart(10, '0') : undefined, anios, ebit, capitalInvertido, roic,
           deudaLp, caja, margenNeto, acciones: anios[0].fin.acciones || undefined, capex }
}

// Lista plana de los conceptos US-GAAP/dei que consumen los extractores — para que el backtest pueda
// adelgazar un companyfacts (miles de conceptos) a solo lo que se usa antes de recortarlo por fecha.
export const CONCEPTOS_FUNDAMENTALES: ReadonlySet<string> = new Set(Object.values(ALIAS).flat())

// Recorta un companyfacts a lo CONOCIDO en `fecha` (punto-en-el-tiempo del retrovisor/backtest):
// solo sobreviven los puntos con `filed <= fecha` (un punto sin `filed` se descarta — mejor perder un
// dato que colar look-ahead). Con `conceptos` además se queda solo con esos conceptos (rendimiento:
// el backtest recorta el mismo companyfacts ~21 veces). Después se reutiliza `extraerFundamentales`.
export function recortarFactsHasta(cf: CompanyFacts, fecha: string, conceptos?: ReadonlySet<string>): CompanyFacts {
  const factsOut: NonNullable<CompanyFacts['facts']> = {}
  for (const [taxonomia, conceptosNodo] of Object.entries(cf.facts ?? {})) {
    const conceptosOut: (typeof factsOut)[string] = {}
    for (const [concepto, nodo] of Object.entries(conceptosNodo ?? {})) {
      if (conceptos && !conceptos.has(concepto)) continue
      const unitsOut: Record<string, PuntoXbrl[]> = {}
      for (const [unidad, puntos] of Object.entries(nodo?.units ?? {})) {
        const filtrados = (puntos ?? []).filter(p => p.filed != null && p.filed <= fecha)
        if (filtrados.length) unitsOut[unidad] = filtrados
      }
      if (Object.keys(unitsOut).length) conceptosOut[concepto] = { units: unitsOut }
    }
    if (Object.keys(conceptosOut).length) factsOut[taxonomia] = conceptosOut
  }
  return { cik: cf.cik, entityName: cf.entityName, facts: factsOut }
}

// El companyfacts CRUDO por CIK (el backtest lo recorta por fecha varias veces sin re-descargar).
export async function companyfactsCrudo(cik: string, timeoutMs = 10000): Promise<unknown | null> {
  return getJson(`https://data.sec.gov/api/xbrl/companyfacts/CIK${cik}.json`, timeoutMs)
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

// Las N mayores de EEUU desde company_tickers.json (viene ~ordenado por capitalización — propiedad
// NO documentada; el consumidor tiene una semilla de respaldo). Dedupe por CIK (una clase por empresa)
// y filtro de tickers raros (warrants/units con guion).
export function listaUniverso(json: unknown, n = 550): Array<{ simbolo: string; cik: string; nombre: string }> {
  const out: Array<{ simbolo: string; cik: string; nombre: string }> = []
  const vistos = new Set<string>()
  const filas = json && typeof json === 'object' ? Object.values(json as Record<string, unknown>) : []
  for (const f of filas) {
    if (out.length >= n) break
    const fila = f as { ticker?: string; cik_str?: number | string; title?: string }
    if (!fila?.ticker || fila.cik_str == null || !fila.title) continue
    const simbolo = String(fila.ticker).toUpperCase()
    if (!/^[A-Z]{1,5}(\.[A-Z])?$/.test(simbolo)) continue    // fuera warrants/units (guiones)
    const cik = String(fila.cik_str).padStart(10, '0')
    if (vistos.has(cik)) continue
    vistos.add(cik)
    out.push({ simbolo, cik, nombre: String(fila.title) })
  }
  return out
}

// companyfacts por CIK ya conocido (el refresco del radar guarda el CIK y se ahorra resolverlo).
export async function fundamentalesCik(simbolo: string, cik: string, timeoutMs = 8000): Promise<FundamentalesEmpresa | null> {
  const cf = await getJson(`https://data.sec.gov/api/xbrl/companyfacts/CIK${cik}.json`, timeoutMs)
  return cf ? extraerFundamentales(cf as CompanyFacts, simbolo) : null
}

// Guarda de PLAUSIBILIDAD del nº de acciones (bug real 20/07/2026: MCD reportó 712 en vez de 712
// MILLONES en el XBRL → mktCap de 196.044$ → EV≈deuda → earnings/FCF yield inflados ×1e6 → nº 1 del
// ranking por artefacto, y de paso contaminó los z-scores de valor de TODO el universo). En un universo
// de large-caps NINGUNA empresa tiene menos de 1M de acciones: por debajo, el dato es basura → null
// (la empresa pierde el factor valor esa semana en vez de envenenar el ranking).
export function accionesPlausibles(n: number | null | undefined): number | null {
  return typeof n === 'number' && Number.isFinite(n) && n >= 1e6 ? n : null
}

// El JSON crudo de company_tickers (para listaUniverso). Best-effort → null.
export async function descargarTickersSec(timeoutMs = 10000): Promise<unknown | null> {
  return getJson('https://www.sec.gov/files/company_tickers.json', timeoutMs)
}

// ── 📰 Eventos corporativos (capa informativa del digest) ─────────────────────────────────────────
// Los 8-K son el registro OFICIAL de eventos materiales (OPAs, quiebras, cambios de control…): fuente
// determinista y gratis, en la misma SEC que ya usamos — nada de titulares ni cifras inventadas.
// Es CONTEXTO para Alberto en el digest; NUNCA filtra ni reordena el ranking (mismo estatus que las
// medias móviles). Se ignoran los items rutinarios (2.02 resultados, 7.01/8.01 genéricos, 9.01 anexos).
export const ITEMS_8K_RELEVANTES: Record<string, string> = {
  '1.01': 'acuerdo material',
  '1.02': 'fin de acuerdo material',
  '1.03': 'quiebra/concurso',
  '2.01': 'adquisición o venta completada',
  '2.05': 'reestructuración',
  '2.06': 'deterioro de activos',
  '3.01': 'aviso de delisting',
  '4.01': 'cambio de auditor',
  '4.02': 'cuentas no fiables',
  '5.01': 'cambio de control',
  '5.02': 'salida/entrada de directivos',
}

export type Evento8K = { fecha: string; items: string[]; etiquetas: string[] }

// Parseo PURO del submissions JSON de la SEC: 8-K presentados desde `desde` (ISO) cuyos items estén
// en la lista relevante. Tolera JSON malformado (devuelve []).
export function extraerEventos8K(subs: unknown, desde: string): Evento8K[] {
  const rec = (subs as { filings?: { recent?: Record<string, unknown[]> } } | null)?.filings?.recent
  const form = Array.isArray(rec?.form) ? (rec!.form as unknown[]) : []
  const filingDate = Array.isArray(rec?.filingDate) ? (rec!.filingDate as unknown[]) : []
  const items = Array.isArray(rec?.items) ? (rec!.items as unknown[]) : []
  const out: Evento8K[] = []
  for (let i = 0; i < form.length; i++) {
    if (form[i] !== '8-K' && form[i] !== '8-K/A') continue
    const fecha = typeof filingDate[i] === 'string' ? (filingDate[i] as string) : ''
    if (!fecha || fecha < desde) continue
    const codigos = String(items[i] ?? '').split(',').map(s => s.trim()).filter(c => ITEMS_8K_RELEVANTES[c] != null)
    if (!codigos.length) continue
    out.push({ fecha, items: codigos, etiquetas: codigos.map(c => ITEMS_8K_RELEVANTES[c]) })
  }
  return out
}

// El submissions JSON crudo por CIK — el radar lo baja UNA vez por símbolo y saca de él tanto los
// 8-K (extraerEventos8K) como los Form 4 (extraerFilingsForm4). Best-effort → null.
export async function submissionsCik(cik: string, timeoutMs = 8000): Promise<unknown | null> {
  return getJson(`https://data.sec.gov/submissions/CIK${cik}.json`, timeoutMs)
}

// Eventos 8-K recientes por CIK ya conocido (submissions JSON). Best-effort → [].
export async function eventos8KCik(cik: string, desde: string, timeoutMs = 8000): Promise<Evento8K[]> {
  const subs = await submissionsCik(cik, timeoutMs)
  return subs ? extraerEventos8K(subs, desde) : []
}

// ── 🧑‍💼 Form 4 (insiders) desde el MISMO submissions JSON ────────────────────────────────────────
// Los filings de ownership aparecen también bajo el CIK del emisor, así que la lista reciente ya trae
// los Form 4 de la empresa — solo hay que quedarse con la referencia (accession) para bajar el XML
// con transaccionesFiling() de form4.ts. Accession SIN guiones (formato de la ruta /Archives/).
export type FilingForm4 = { fecha: string; accesion: string }

export function extraerFilingsForm4(subs: unknown, desde: string): FilingForm4[] {
  const rec = (subs as { filings?: { recent?: Record<string, unknown[]> } } | null)?.filings?.recent
  const form = Array.isArray(rec?.form) ? (rec!.form as unknown[]) : []
  const filingDate = Array.isArray(rec?.filingDate) ? (rec!.filingDate as unknown[]) : []
  const accession = Array.isArray(rec?.accessionNumber) ? (rec!.accessionNumber as unknown[]) : []
  const out: FilingForm4[] = []
  for (let i = 0; i < form.length; i++) {
    if (form[i] !== '4' && form[i] !== '4/A') continue
    const fecha = typeof filingDate[i] === 'string' ? (filingDate[i] as string) : ''
    if (!fecha || fecha < desde) continue
    const acc = String(accession[i] ?? '').replace(/-/g, '')
    if (!/^\d{18}$/.test(acc)) continue
    out.push({ fecha, accesion: acc })
  }
  return out
}
