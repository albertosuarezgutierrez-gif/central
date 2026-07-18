// Evaluación de SELECCIÓN vs benchmark (Fase B). Aísla la ventaja de ELEGIR bien de la del timing:
// compra la cesta seleccionada EQUIPONDERADA y la mantiene (buy & hold), y la compara con el índice
// (SPY) en el mismo periodo. Si la cesta no bate al SPY comprando y aguantando, la selección no aporta
// y no hay nada que afinar con el técnico. Puro y serializable: el consumidor aporta los cierres.

// Retorno total de una serie de cierres (último/primero − 1). Requiere ≥2 puntos y primero > 0.
export function retornoTotal(cierres: number[]): number | null {
  if (!Array.isArray(cierres) || cierres.length < 2) return null
  const p0 = cierres[0]
  const pN = cierres[cierres.length - 1]
  if (!(p0 > 0)) return null
  return pN / p0 - 1
}

export type RetornoSimbolo = { simbolo: string; retorno: number }

export type EvalCesta = {
  n: number                       // símbolos con datos suficientes
  retornoCesta: number            // retorno de la cesta equiponderada buy & hold
  retornoBench: number            // retorno del benchmark en el mismo periodo
  alpha: number                   // cesta − benchmark (lo que decide: >0 = la selección aporta)
  bate: boolean                   // alpha > 0
  ganadoresVsBench: number        // nº de símbolos que individualmente batieron al benchmark
  porSimbolo: RetornoSimbolo[]    // retorno individual, de mejor a peor
}

// Compara una cesta EQUIPONDERADA (buy & hold) con un benchmark. El retorno de la cesta equiponderada
// es la MEDIA de los retornos brutos individuales (mismo € en cada nombre al inicio, sin rebalanceo).
// Descarta los símbolos sin cierres suficientes. Devuelve null si ninguno tiene datos o falta el bench.
export function evaluarCestaVsBench(
  cesta: Array<{ simbolo: string; cierres: number[] }>,
  benchCierres: number[],
): EvalCesta | null {
  const retornoBench = retornoTotal(benchCierres)
  if (retornoBench == null) return null

  const porSimbolo: RetornoSimbolo[] = []
  for (const { simbolo, cierres } of cesta) {
    const r = retornoTotal(cierres)
    if (r == null) continue
    porSimbolo.push({ simbolo, retorno: r })
  }
  if (porSimbolo.length === 0) return null

  const retornoCesta = porSimbolo.reduce((s, x) => s + x.retorno, 0) / porSimbolo.length
  porSimbolo.sort((a, b) => b.retorno - a.retorno)
  const alpha = retornoCesta - retornoBench
  return {
    n: porSimbolo.length,
    retornoCesta,
    retornoBench,
    alpha,
    bate: alpha > 0,
    ganadoresVsBench: porSimbolo.filter(x => x.retorno > retornoBench).length,
    porSimbolo,
  }
}
