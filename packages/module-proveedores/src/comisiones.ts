// Lógica de comisiones de proveedores. Funciones puras sobre los tipos genéricos.
import type { ProveedorServicio } from './types'

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100
}

/** Comisión = importe × comisiónPct / 100. */
export function calcularComision(importe: number, comisionPct: number): number {
  return round2((importe * comisionPct) / 100)
}

/** Suma de comisiones de un conjunto de servicios. */
export function totalComisiones(servicios: ProveedorServicio[]): number {
  return round2(servicios.reduce((s, x) => s + x.comisionImporte, 0))
}

/** Suma de comisiones ya cobradas (estado 'cobrada'). */
export function comisionesCobradas(servicios: ProveedorServicio[]): number {
  return round2(
    servicios.filter(x => x.estado === 'cobrada').reduce((s, x) => s + x.comisionImporte, 0),
  )
}
