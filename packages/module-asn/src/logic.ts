// Lógica del ASN: totales de líneas. Funciones puras.
import type { LineaASN } from './types'

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100
}

/** Importe de una línea = cantidad × precioUnitario (0 si no hay precio). */
export function totalLinea(l: LineaASN): number {
  return round2(l.cantidad * (l.precioUnitario ?? 0))
}

/** Importe total del albarán/ASN. */
export function totalLineas(lineas: LineaASN[]): number {
  return round2(lineas.reduce((s, l) => s + totalLinea(l), 0))
}

/** Unidades totales recibidas. */
export function unidadesTotales(lineas: LineaASN[]): number {
  return lineas.reduce((s, l) => s + l.cantidad, 0)
}
