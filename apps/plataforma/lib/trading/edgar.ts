// Fundamentales GRATIS desde EDGAR (SEC) — API XBRL `companyfacts`. Alternativa sin coste a FMP para
// la pata de CALIDAD/VALOR de la Fase B: alimenta directamente `piotroskiFScore` (2 ejercicios) y el
// ROIC de la fórmula mágica. Mapea los conceptos US-GAAP **e IFRS** a los inputs que el módulo ya
// consume — así los emisores extranjeros que cotizan en EEUU pero presentan 20-F en taxonomía
// `ifrs-full` (SPOT, ASML, NVO, ARM…) dejan de salir con todos los fundamentales a null.
// Parseo PURO y testeado; el fetch corre desde el egress de Vercel (la SEC exige User-Agent con
// contacto y bloquea IPs anónimas / el sandbox de las sesiones).
import type { AnioFinanciero } from '@central/module-trading'

const SEC_UA = 'central-trading paper-research (contacto: alberto.suarez.gutierrez@gmail.com)'

type PuntoXbrl = { start?: string; end: string; val: number; fy?: number; fp?: string; form?: string; filed?: string }
export type CompanyFacts = { cik?: number; entityName?: string; facts?: Record<string, Record<string, { units?: Record<string, PuntoXbrl[]> }>> }

const FORMAS_ANUALES = new Set(['10-K', '10-K/A', '20-F', '20-F/A'])
const diasEntre = (a: string, b: string) => Math.abs((Date.parse(b) - Date.parse(a)) / 86_400_000)

// Serie ANUAL de un concepto, indexada por el CIERRE DE EJERCICIO AL QUE PERTENECE EL DATO (`end`),
// buscándolo en us-gaap, dei e ifrs-full (emisores extranjeros que presentan 20-F en IFRS).
//
// 🚨 LANDMINE (31/07/2026): en companyfacts `fy`/`fp` identifican el INFORME en el que se publicó el
// hecho, NO el periodo que mide ese hecho — ese lo dan `start`/`end`. Un informe anual trae 2-3
// ejercicios COMPARATIVOS y todos llevan el `fy` del informe: el 10-K FY2026 de Oracle (`filed`
// 2026-06-22) publica el beneficio de FY2024 (10.467 M$), FY2025 (12.443 M$) y FY2026 (17.087 M$) los
// tres con `fy:2026, fp:FY`. Indexar por `fy` los colapsaba en una sola clave y —como comparten
// `filed`, la guarda de reexpresión los descartaba por empate— se quedaba con el PRIMERO del array,
// que es el MÁS VIEJO. Efecto medido en el radar: resultado y flujos 2 años atrasados, balance 1 año
// (solo trae 2 comparativos), y ratios que MEZCLAN ambos — el ROA de ORCL salía como beneficio de
// FY2024 ÷ activos de FY2025. Fallaba en silencio porque el orden de magnitud seguía siendo creíble.
// La clave correcta es `end`, que TODOS los hechos anuales de un mismo ejercicio comparten.
export function serieAnual(facts: CompanyFacts['facts'], concepto: string): Map<string, number> {
  const out = new Map<string, number>()
  const filedDe = new Map<string, string>()
  const nodos = [facts?.['us-gaap']?.[concepto], facts?.['dei']?.[concepto], facts?.['ifrs-full']?.[concepto]].filter(Boolean)
  for (const nodo of nodos) {
    for (const puntos of Object.values(nodo!.units ?? {})) {
      for (const p of puntos) {
        if (typeof p.val !== 'number' || !p.end) continue
        if (!p.form || !FORMAS_ANUALES.has(p.form) || p.fp !== 'FY') continue
        // Un informe anual también publica columnas trimestrales: un hecho de DURACIÓN solo vale si
        // abarca el ejercicio entero. Los de INSTANTE (balance) no llevan `start` y pasan tal cual.
        if (p.start && (diasEntre(p.start, p.end) < 300 || diasEntre(p.start, p.end) > 400)) continue
        // Reexpresiones: ante el mismo cierre gana el informe presentado más tarde.
        const prev = filedDe.get(p.end)
        if (prev && p.filed && prev > p.filed) continue
        out.set(p.end, p.val)
        if (p.filed) filedDe.set(p.end, p.filed)
      }
    }
  }
  return out
}

// Etiqueta de ejercicio (solo para MOSTRAR: `fuente_fy` del radar y `fyUltimo` de la API). El año
// natural del cierre coincide con la etiqueta del emisor salvo en los calendarios de 52/53 semanas que
// cierran en los primeros días de enero, que pertenecen al ejercicio anterior (un cierre a 31/01 —
// Walmart y demás minoristas— sí es del año natural de su fecha).
export function anioFiscalDe(periodo: string): number {
  const [a, m, d] = periodo.split('-').map(Number)
  return m === 1 && d <= 14 ? a - 1 : a
}

// Valor del primer alias con dato para ese cierre de ejercicio. Si el concepto no cae EXACTAMENTE en
// `periodo` se acepta el cierre más próximo dentro de 45 días: las acciones de portada (taxonomía
// `dei`) se fechan unas semanas después del cierre y los calendarios de 52/53 semanas lo mueven días.
function valorPeriodo(facts: CompanyFacts['facts'], alias: string[], periodo: string): number | undefined {
  for (const c of alias) {
    const serie = serieAnual(facts, c)
    const exacto = serie.get(periodo)
    if (exacto != null) return exacto
    let mejor: { dias: number; val: number } | undefined
    for (const [fin, val] of serie) {
      const dias = diasEntre(fin, periodo)
      if (dias <= 45 && (!mejor || dias < mejor.dias)) mejor = { dias, val }
    }
    if (mejor) return mejor.val
  }
  return undefined
}
const div = (a?: number, b?: number) => (a != null && b != null && b !== 0 ? a / b : 0)

// Cada input lleva sus alias US-GAAP PRIMERO y, al final, los conceptos IFRS (`ifrs-full`) equivalentes
// para los emisores extranjeros (20-F). `valorFy` devuelve el primer alias con dato → una empresa de EEUU
// resuelve por el nombre us-gaap (sin cambio) y una extranjera cae al nombre IFRS. `Assets`/`GrossProfit`
// comparten nombre en ambas taxonomías (los cubre el nodo `ifrs-full` que añadió `serieAnual`).
const ALIAS = {
  netIncome: ['NetIncomeLoss', 'ProfitLoss'],
  assets: ['Assets'],
  cfo: ['NetCashProvidedByUsedInOperatingActivities', 'NetCashProvidedByUsedInOperatingActivitiesContinuingOperations', 'CashFlowsFromUsedInOperatingActivities'],
  deudaLp: ['LongTermDebtNoncurrent', 'LongTermDebt', 'NoncurrentPortionOfNoncurrentBorrowings', 'LongtermBorrowings', 'Borrowings'],
  caja: ['CashAndCashEquivalentsAtCarryingValue', 'CashAndCashEquivalents'],
  activoCorriente: ['AssetsCurrent', 'CurrentAssets'],
  pasivoCorriente: ['LiabilitiesCurrent', 'CurrentLiabilities'],
  acciones: ['WeightedAverageNumberOfDilutedSharesOutstanding', 'WeightedAverageNumberOfSharesOutstandingBasic', 'CommonStockSharesOutstanding', 'EntityCommonStockSharesOutstanding', 'WeightedAverageShares', 'AdjustedWeightedAverageShares'],
  ventas: ['Revenues', 'RevenueFromContractWithCustomerExcludingAssessedTax', 'SalesRevenueNet', 'Revenue', 'RevenueFromContractsWithCustomers'],
  brutoBeneficio: ['GrossProfit'],
  ebit: ['OperatingIncomeLoss', 'ProfitLossFromOperatingActivities'],
  capex: ['PaymentsToAcquirePropertyPlantAndEquipment', 'PaymentsToAcquireProductiveAssets', 'PurchaseOfPropertyPlantAndEquipmentClassifiedAsInvestingActivities'],
}

// Cierres de ejercicio (por CUALQUIER alias) que tienen dato — para anclar la extracción sin atarse a
// un nombre us-gaap concreto (si no, un emisor IFRS cuyo beneficio es `ProfitLoss` y no `NetIncomeLoss`
// no ancla nunca).
function periodosDe(facts: CompanyFacts['facts'], alias: string[]): Set<string> {
  const s = new Set<string>()
  for (const c of alias) for (const fin of serieAnual(facts, c).keys()) s.add(fin)
  return s
}

function anioDe(facts: CompanyFacts['facts'], periodo: string): AnioFinanciero {
  const assets = valorPeriodo(facts, ALIAS.assets, periodo)
  const ventas = valorPeriodo(facts, ALIAS.ventas, periodo)
  return {
    roa: div(valorPeriodo(facts, ALIAS.netIncome, periodo), assets),
    cfo: valorPeriodo(facts, ALIAS.cfo, periodo) ?? 0,
    beneficioNeto: valorPeriodo(facts, ALIAS.netIncome, periodo) ?? 0,
    ratioDeudaLp: div(valorPeriodo(facts, ALIAS.deudaLp, periodo), assets),
    ratioCorriente: div(valorPeriodo(facts, ALIAS.activoCorriente, periodo), valorPeriodo(facts, ALIAS.pasivoCorriente, periodo)),
    acciones: valorPeriodo(facts, ALIAS.acciones, periodo) ?? 0,
    margenBruto: div(valorPeriodo(facts, ALIAS.brutoBeneficio, periodo), ventas),
    rotacionActivos: div(ventas, assets),
  }
}

export type FundamentalesEmpresa = {
  simbolo: string
  cik?: string
  // 2 ejercicios más recientes: [0]=actual, [1]=previo. `periodo` es el cierre real (fuente de verdad
  // del alineamiento entre conceptos); `fy` es solo la etiqueta legible de ese cierre.
  anios: Array<{ fy: number; periodo: string; fin: AnioFinanciero }>
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
  // Cierres que tienen las dos anclas mínimas (beneficio neto + activos), de más nuevo a más viejo.
  // Alias-aware: cubre US-GAAP (NetIncomeLoss) e IFRS (ProfitLoss) sin atarse a un nombre concreto. El
  // cruce tolera unos días de desfase entre el cierre del resultado y el del balance (52/53 semanas).
  const cierresAssets = [...periodosDe(facts, ALIAS.assets)]
  const conAncla = [...periodosDe(facts, ALIAS.netIncome)]
    .filter(fin => cierresAssets.some(a => diasEntre(a, fin) <= 7))
    .sort((a, b) => (a < b ? 1 : a > b ? -1 : 0))
  if (conAncla.length === 0) return null
  const anios = conAncla.slice(0, 2).map(periodo => ({ fy: anioFiscalDe(periodo), periodo, fin: anioDe(facts, periodo) }))

  const ult = anios[0].periodo
  const ebit = valorPeriodo(facts, ALIAS.ebit, ult)
  const capitalInvertido = valorPeriodo(facts, ALIAS.assets, ult) != null
    ? (valorPeriodo(facts, ALIAS.assets, ult)! - (valorPeriodo(facts, ALIAS.pasivoCorriente, ult) ?? 0))
    : undefined
  const roic = ebit != null && capitalInvertido && capitalInvertido !== 0 ? ebit / capitalInvertido : undefined

  const deudaLp = valorPeriodo(facts, ALIAS.deudaLp, ult)
  const caja = valorPeriodo(facts, ALIAS.caja, ult)
  const ventas = valorPeriodo(facts, ALIAS.ventas, ult)
  const neto = valorPeriodo(facts, ALIAS.netIncome, ult)
  const margenNeto = ventas ? div(neto, ventas) : undefined
  const capex = valorPeriodo(facts, ALIAS.capex, ult)
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

// ── 📅 Semana de resultados ESTIMADA ──────────────────────────────────────────────────────────────
// La SEC no publica fechas FUTURAS de resultados; lo que sí tenemos (gratis y determinista) es el
// PATRÓN: las empresas presentan sus 10-Q/10-K casi las mismas semanas cada año. Estimación = fecha
// del filing del año pasado + 365 días; si cae en los próximos `ventanaDias`, se avisa como
// «estimado» (honesto: la nota de resultados suele salir unos días ANTES del filing). Contexto puro.
export function estimarProximoInforme(subs: unknown, hoy: string, ventanaDias = 10): string | null {
  const rec = (subs as { filings?: { recent?: Record<string, unknown[]> } } | null)?.filings?.recent
  const form = Array.isArray(rec?.form) ? (rec!.form as unknown[]) : []
  const filingDate = Array.isArray(rec?.filingDate) ? (rec!.filingDate as unknown[]) : []
  const limite = new Date(Date.parse(hoy) + ventanaDias * 86_400_000).toISOString().slice(0, 10)
  let mejor: string | null = null
  for (let i = 0; i < form.length; i++) {
    if (form[i] !== '10-Q' && form[i] !== '10-K') continue
    const fecha = typeof filingDate[i] === 'string' ? (filingDate[i] as string) : ''
    if (!fecha) continue
    const estimada = new Date(Date.parse(fecha) + 365 * 86_400_000).toISOString().slice(0, 10)
    if (estimada < hoy || estimada > limite) continue
    if (mejor == null || estimada < mejor) mejor = estimada
  }
  return mejor
}

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
