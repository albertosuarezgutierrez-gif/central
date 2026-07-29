// Piotroski F-score (0..9): salud contable de una empresa comparando el año actual con el previo.
// 9 señales binarias en 3 bloques. Cuanto más alto, mejor la calidad fundamental (≥7 fuerte, ≤2 flojo).
// Puro y serializable: el consumidor (FMP/EDGAR) aporta los ratios ya calculados de dos ejercicios.

export type AnioFinanciero = {
  roa: number             // beneficio neto / activos totales
  cfo: number             // flujo de caja de explotación (signo y vs beneficio es lo que importa)
  beneficioNeto: number
  ratioDeudaLp: number    // deuda a largo plazo / activos totales (apalancamiento; menos = mejor)
  ratioCorriente: number  // activo corriente / pasivo corriente (liquidez; más = mejor)
  acciones: number        // nº de acciones en circulación (más = dilución = peor)
  margenBruto: number     // margen bruto (beneficio bruto / ventas)
  rotacionActivos: number // ventas / activos totales (eficiencia)
}

export type Piotroski = { score: number; detalle: Record<string, boolean> }

// Devuelve el F-score y el desglose de las 9 señales. Los empates cuentan a favor solo cuando la regla
// canónica lo hace (acciones: no AUMENTAR puntúa; el resto exige mejora estricta).
export function piotroskiFScore(actual: AnioFinanciero, previo: AnioFinanciero): Piotroski {
  const detalle: Record<string, boolean> = {
    // Rentabilidad (4)
    roaPositivo: actual.roa > 0,
    cfoPositivo: actual.cfo > 0,
    roaMejora: actual.roa > previo.roa,
    calidadBeneficio: actual.cfo > actual.beneficioNeto,   // devengo: la caja supera al beneficio contable
    // Apalancamiento, liquidez y fuente de fondos (3)
    menosDeudaLp: actual.ratioDeudaLp < previo.ratioDeudaLp,
    masLiquidez: actual.ratioCorriente > previo.ratioCorriente,
    sinDilucion: actual.acciones <= previo.acciones,        // no emitir nuevas acciones
    // Eficiencia operativa (2)
    mejorMargenBruto: actual.margenBruto > previo.margenBruto,
    mejorRotacion: actual.rotacionActivos > previo.rotacionActivos,
  }
  const score = Object.values(detalle).filter(Boolean).length
  return { score, detalle }
}
