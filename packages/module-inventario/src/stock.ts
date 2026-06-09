// Lógica de stock del inventario. Funciones puras sobre los tipos genéricos (sin BD).
import type { Articulo, ResumenStock } from './types'

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100
}

/** Disponible tras reservar `cantidad` unidades (no baja de 0). */
export function disponibilidadTrasReserva(disponible: number, cantidad: number): number {
  return Math.max(0, disponible - cantidad)
}

/** Disponible tras devolver `cantidad` unidades (no supera el total). */
export function disponibilidadTrasDevolucion(
  disponible: number,
  total: number,
  cantidad: number,
): number {
  return Math.min(total, disponible + cantidad)
}

/** Coste de los daños = unidades dañadas × coste unitario (de reposición). */
export function costeDanos(cantidadDanada: number, costeUnitario: number): number {
  return round2(cantidadDanada * costeUnitario)
}

/** Valor del stock = Σ cantidadTotal × costeUnitario. */
export function valorStock(articulos: Articulo[]): number {
  return round2(articulos.reduce((s, a) => s + a.cantidadTotal * (a.costeUnitario ?? 0), 0))
}

/** Resumen agregado del catálogo. */
export function resumenStock(articulos: Articulo[]): ResumenStock {
  const unidadesTotales = articulos.reduce((s, a) => s + a.cantidadTotal, 0)
  const unidadesDisponibles = articulos.reduce((s, a) => s + a.cantidadDisponible, 0)
  return {
    articulos: articulos.length,
    unidadesTotales,
    unidadesDisponibles,
    unidadesComprometidas: unidadesTotales - unidadesDisponibles,
    valorTotal: valorStock(articulos),
  }
}
