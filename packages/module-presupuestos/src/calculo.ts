// Lógica de presupuestos: cálculo de totales, descuento, margen y rentabilidad.
// Funciones puras sobre los tipos genéricos (sin BD).
import type {
  CosteLinea,
  LineaPresupuesto,
  Margen,
  Presupuesto,
  ResumenPresupuesto,
} from './types'

export const RENTABILIDAD_MINIMA_PCT_DEFAULT = 25

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100
}

/** Total bruto de las líneas = Σ cantidad × precioUnitario. */
export function totalLineas(lineas: LineaPresupuesto[]): number {
  return round2(lineas.reduce((s, l) => s + l.cantidad * l.precioUnitario, 0))
}

/** Total de costes = Σ importe. */
export function totalCostes(costes: CosteLinea[]): number {
  return round2(costes.reduce((s, c) => s + c.importe, 0))
}

/** Margen sobre un total e importe de coste, con umbral de rentabilidad. */
export function calcularMargen(
  total: number,
  costeTotal: number,
  rentabilidadMinimaPct: number = RENTABILIDAD_MINIMA_PCT_DEFAULT,
): Margen {
  const margenImporte = round2(total - costeTotal)
  const margenPct = total > 0 ? round2((margenImporte / total) * 100) : 0
  return {
    costeTotal: round2(costeTotal),
    margenImporte,
    margenPct,
    rentable: margenPct >= rentabilidadMinimaPct,
  }
}

export function esRentable(
  margenPct: number,
  rentabilidadMinimaPct: number = RENTABILIDAD_MINIMA_PCT_DEFAULT,
): boolean {
  return margenPct >= rentabilidadMinimaPct
}

/** Resumen completo del presupuesto (bruto, descuento, neto, margen). */
export function resumenPresupuesto(
  p: Presupuesto,
  rentabilidadMinimaPct: number = RENTABILIDAD_MINIMA_PCT_DEFAULT,
): ResumenPresupuesto {
  const subtotalBruto = totalLineas(p.lineas)
  const descuentoImporte = p.descuento
    ? round2((subtotalBruto * p.descuento.porcentaje) / 100)
    : 0
  const subtotalNeto = round2(subtotalBruto - descuentoImporte)
  const margen = calcularMargen(subtotalNeto, totalCostes(p.costes), rentabilidadMinimaPct)
  return { subtotalBruto, descuentoImporte, subtotalNeto, margen }
}
