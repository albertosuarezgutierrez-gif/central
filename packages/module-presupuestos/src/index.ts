// @iarest/module-presupuestos — Presupuestos genéricos de la casa de marcas.
// Líneas + costes + descuento + margen/rentabilidad. Cada vertical aporta su adaptador.
// Ver docs/DISENO-modularizacion-verticales.md.

export type {
  ParentType,
  ParentRef,
  EstadoPresupuesto,
  LineaPresupuesto,
  CosteLinea,
  Descuento,
  Margen,
  Presupuesto,
  ResumenPresupuesto,
  PresupuestoAdapter,
} from './types'

export {
  RENTABILIDAD_MINIMA_PCT_DEFAULT,
  round2,
  totalLineas,
  totalCostes,
  calcularMargen,
  esRentable,
  resumenPresupuesto,
} from './calculo'
