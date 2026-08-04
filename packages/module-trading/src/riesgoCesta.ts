// MÉTRICAS DE RIESGO de una cesta vs benchmark (Fase B, idea 3). Batir al SPY con el triple de
// volatilidad NO es batirlo: la pregunta honesta no es "¿sube más?" sino "¿sube más por unidad de
// riesgo?". Sobre las series de cierres diarios (mismo calendario bursátil) construye la CURVA de la
// cesta equiponderada buy&hold y calcula drawdown máximo, volatilidad anualizada y tracking error vs el
// índice. Puro y serializable: el consumidor aporta los cierres. Best-effort (devuelve null si faltan datos).

const ANUAL = 252 // días de bolsa/año, para anualizar la volatilidad diaria

// Retornos diarios simples de una curva (curva[t]/curva[t-1] − 1). Salta pasos con precio previo ≤ 0.
export function retornosDiarios(curva: number[]): number[] {
  const r: number[] = []
  for (let i = 1; i < curva.length; i++) {
    if (curva[i - 1] > 0) r.push(curva[i] / curva[i - 1] - 1)
  }
  return r
}

// Desviación típica muestral (n−1). null con menos de 2 datos.
export function desviacion(xs: number[]): number | null {
  if (xs.length < 2) return null
  const m = xs.reduce((a, b) => a + b, 0) / xs.length
  const v = xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1)
  return Math.sqrt(v)
}

// Drawdown máximo (peor caída pico→valle) de una curva, como fracción ≤ 0 (ej −0,12 = −12%).
export function maxDrawdown(curva: number[]): number {
  let pico = -Infinity
  let mdd = 0
  for (const v of curva) {
    if (v > pico) pico = v
    if (pico > 0) {
      const dd = v / pico - 1
      if (dd < mdd) mdd = dd
    }
  }
  return mdd
}

// Curva de la cesta EQUIPONDERADA buy&hold: valor_t = media_i(precio_i,t / precio_i,0). Alinea las series
// a la longitud común más corta (asume mismo calendario bursátil — cierto para acciones USA de la misma
// fuente). Descarta series sin ≥2 puntos o con primer precio ≤ 0. curva[0] = 1. null si ninguna sirve.
export function curvaCestaEquiponderada(series: number[][]): number[] | null {
  const validas = series.filter(s => Array.isArray(s) && s.length >= 2 && s[0] > 0)
  if (!validas.length) return null
  const len = Math.min(...validas.map(s => s.length))
  if (len < 2) return null
  const curva: number[] = []
  for (let t = 0; t < len; t++) {
    let suma = 0
    for (const s of validas) suma += s[t] / s[0]
    curva.push(suma / validas.length)
  }
  return curva
}

// Volatilidad ANUALIZADA de una curva (σ de los retornos diarios × √252). null con datos insuficientes.
export function volatilidadAnual(curva: number[]): number | null {
  const sd = desviacion(retornosDiarios(curva))
  return sd == null ? null : sd * Math.sqrt(ANUAL)
}

// Tracking error ANUALIZADO: σ de (retorno_cesta − retorno_bench) día a día × √252. Mide cuánto se
// despega la cesta del índice (riesgo activo). Alinea ambas curvas a la longitud común. null si <3 puntos.
export function trackingErrorAnual(curvaCesta: number[], curvaBench: number[]): number | null {
  const n = Math.min(curvaCesta.length, curvaBench.length)
  if (n < 3) return null
  const rc = retornosDiarios(curvaCesta.slice(0, n))
  const rb = retornosDiarios(curvaBench.slice(0, n))
  const m = Math.min(rc.length, rb.length)
  const dif: number[] = []
  for (let i = 0; i < m; i++) dif.push(rc[i] - rb[i])
  const sd = desviacion(dif)
  return sd == null ? null : sd * Math.sqrt(ANUAL)
}

export type MetricasRiesgo = {
  maxDrawdown: number            // cesta, ≤ 0
  maxDrawdownBench: number       // benchmark, ≤ 0
  volAnual: number | null        // cesta, anualizada
  volBenchAnual: number | null   // benchmark, anualizada
  trackingError: number | null   // riesgo activo cesta vs bench, anualizado
}

// Métricas de riesgo de la cesta equiponderada vs el benchmark, a partir de los cierres diarios de cada
// símbolo y del índice. null si no se puede construir alguna curva.
export function metricasRiesgoCesta(series: number[][], bench: number[]): MetricasRiesgo | null {
  const curvaCesta = curvaCestaEquiponderada(series)
  const curvaBench = Array.isArray(bench) && bench.length >= 2 && bench[0] > 0 ? bench.map(p => p / bench[0]) : null
  if (!curvaCesta || !curvaBench) return null
  return {
    maxDrawdown: maxDrawdown(curvaCesta),
    maxDrawdownBench: maxDrawdown(curvaBench),
    volAnual: volatilidadAnual(curvaCesta),
    volBenchAnual: volatilidadAnual(curvaBench),
    trackingError: trackingErrorAnual(curvaCesta, curvaBench),
  }
}
