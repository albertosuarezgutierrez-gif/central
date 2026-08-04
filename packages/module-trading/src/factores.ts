// Modelo de factores (value + quality + momentum): el núcleo de la SELECCIÓN de la Fase B.
// La idea NO es acertar el timing (eso pierde, medido) sino ELEGIR qué comprar: empresas baratas
// (value), sanas (quality) y con inercia de precio a medio plazo (momentum), y mantenerlas.
//
// El scoring es CROSS-SECCIONAL: cada métrica se normaliza (z-score) contra el resto del universo,
// así comparamos "barato vs sus pares", no contra un umbral absoluto. Un dato ausente = 0 (neutral),
// nunca penaliza ni premia por faltar. Todo puro; el consumidor (FMP/EDGAR) aporta las métricas.

export type MetricasFactor = {
  simbolo: string
  // Value — más alto = más barato = mejor
  earningsYield?: number    // EBIT/EV
  fcfYield?: number         // free cash flow / market cap
  shareholderYield?: number // (dividendos + recompras − dilución) / market cap
  // Quality — más alto = mejor
  roic?: number
  margenNeto?: number
  piotroski?: number        // 0..9 (F-score)
  // Apalancamiento — más BAJO = mejor (se invierte al normalizar)
  deudaEbitda?: number
  // Momentum de precio — más alto = mejor (retorno 12−1 meses)
  momentum12m?: number
}

export type PesosFactor = { valor: number; calidad: number; momentum: number }
const PESOS_DEFECTO: PesosFactor = { valor: 0.4, calidad: 0.4, momentum: 0.2 }

export type ScoreFactor = {
  simbolo: string
  score: number       // compuesto ponderado (z-scores; 0 ≈ media del universo)
  zValor: number
  zCalidad: number
  zMomentum: number
}

// z-scores de una columna: (x − media) / desviación, sobre los valores DEFINIDOS. Los ausentes salen 0.
// Con menos de 2 valores definidos o desviación 0 no hay dispersión que normalizar → todo 0 (neutral).
export function zscores(columna: (number | undefined)[]): number[] {
  const definidos = columna.filter((x): x is number => x !== undefined && Number.isFinite(x))
  if (definidos.length < 2) return columna.map(() => 0)
  const media = definidos.reduce((a, b) => a + b, 0) / definidos.length
  const varianza = definidos.reduce((a, b) => a + (b - media) ** 2, 0) / definidos.length
  const sd = Math.sqrt(varianza)
  if (sd === 0) return columna.map(() => 0)
  return columna.map(x => (x !== undefined && Number.isFinite(x) ? (x - media) / sd : 0))
}

// Media de varias columnas de z-scores, posición a posición (cada pilar promedia sus métricas).
function promedioZ(columnas: number[][], n: number): number[] {
  if (columnas.length === 0) return new Array(n).fill(0)
  return Array.from({ length: n }, (_, i) => {
    const suma = columnas.reduce((a, col) => a + col[i], 0)
    return suma / columnas.length
  })
}

// Rankea el universo por el score compuesto (mejor primero). Pesos ajustables por pata.
export function rankearFactores(universo: MetricasFactor[], pesos: Partial<PesosFactor> = {}): ScoreFactor[] {
  const n = universo.length
  if (n === 0) return []
  const w = { ...PESOS_DEFECTO, ...pesos }
  const sumaW = w.valor + w.calidad + w.momentum || 1

  // Value: earningsYield, fcfYield, shareholderYield (todas "más alto mejor").
  const zVal = promedioZ([
    zscores(universo.map(c => c.earningsYield)),
    zscores(universo.map(c => c.fcfYield)),
    zscores(universo.map(c => c.shareholderYield)),
  ], n)
  // Quality: roic, margenNeto, piotroski (más alto mejor) + deudaEbitda INVERTIDA (menos deuda mejor).
  const zCal = promedioZ([
    zscores(universo.map(c => c.roic)),
    zscores(universo.map(c => c.margenNeto)),
    zscores(universo.map(c => c.piotroski)),
    zscores(universo.map(c => (c.deudaEbitda !== undefined ? -c.deudaEbitda : undefined))),
  ], n)
  // Momentum: una sola métrica.
  const zMom = zscores(universo.map(c => c.momentum12m))

  return universo
    .map((c, i) => ({
      simbolo: c.simbolo,
      zValor: zVal[i],
      zCalidad: zCal[i],
      zMomentum: zMom[i],
      score: (w.valor * zVal[i] + w.calidad * zCal[i] + w.momentum * zMom[i]) / sumaW,
    }))
    .sort((a, b) => b.score - a.score)
}

// Momentum de precio 12−1 meses (retorno de hace ~12 meses hasta hace ~1 mes; se salta el último mes
// porque el momentum muy reciente revierte). Sobre cierres diarios. Degrada al tramo disponible si hay
// menos de un año de histórico; null si no hay suficiente para ser significativo.
export function momentum12_1(cierres: number[], ventana = 252, saltar = 21): number | null {
  if (cierres.length < saltar + 20) return null
  const fin = cierres.length - 1 - saltar               // hace ~1 mes
  const ini = Math.max(0, cierres.length - 1 - ventana) // hace ~12 meses (o el punto más antiguo)
  if (fin <= ini || cierres[ini] <= 0) return null
  return cierres[fin] / cierres[ini] - 1
}
