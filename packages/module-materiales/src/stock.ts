// Lógica de stock del módulo Materiales. Funciones puras sobre tipos genéricos (sin BD).
import type { Material, AsignacionMaterial, ResumenStock, ResumenContable } from './types'

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100
}

/** Disponible tras reservar `cantidad` unidades (no baja de 0). */
export function disponibilidadTrasReserva(disponible: number, cantidad: number): number {
  return Math.max(0, disponible - cantidad)
}

/** Disponible tras devolver `cantidad` unidades (no supera el total). */
export function disponibilidadTrasDevolucion(disponible: number, total: number, cantidad: number): number {
  return Math.min(total, disponible + cantidad)
}

/** Coste de los daños = unidades dañadas × coste de reposición. */
export function costeDanos(cantidadDanada: number, costeReposicion: number): number {
  return round2(cantidadDanada * costeReposicion)
}

/** Valor del stock = Σ cantidadTotal × costeReposicion. */
export function valorStock(materiales: Material[]): number {
  return round2(materiales.reduce((s, m) => s + m.cantidadTotal * m.costeReposicion, 0))
}

/** Resumen agregado del catálogo (cantidades + valor de reposición). */
export function resumenStock(materiales: Material[]): ResumenStock {
  const unidadesTotales = materiales.reduce((s, m) => s + m.cantidadTotal, 0)
  const unidadesDisponibles = materiales.reduce((s, m) => s + m.cantidadDisponible, 0)
  return {
    materiales: materiales.length,
    unidadesTotales,
    unidadesDisponibles,
    unidadesComprometidas: unidadesTotales - unidadesDisponibles,
    valorTotal: valorStock(materiales),
  }
}

/** Gasto total de compra = Σ cantidadTotal × precioCompra. */
export function gastoCompras(materiales: Material[]): number {
  return round2(materiales.reduce((s, m) => s + m.cantidadTotal * m.precioCompra, 0))
}

/** Resumen contable: gasto en compras, gasto en roturas, valor de inventario disponible. */
export function resumenContable(materiales: Material[], asignaciones: AsignacionMaterial[]): ResumenContable {
  const gastoRoturas = round2(asignaciones.reduce((s, a) => s + (a.costeDanos ?? 0), 0))
  const valorInventario = round2(materiales.reduce((s, m) => s + m.cantidadDisponible * m.costeReposicion, 0))
  return {
    gastoCompras: gastoCompras(materiales),
    gastoRoturas,
    valorInventario,
    totalMateriales: materiales.length,
    totalActivos: materiales.filter(m => m.tipo === 'activo').length,
    totalConsumibles: materiales.filter(m => m.tipo === 'consumible').length,
  }
}

/** True si el material puede transferirse (operativo/deteriorado, activo, disponibles suficientes). */
export function puedeTransferir(material: Material, cantidad: number): boolean {
  if (!material.activo) return false
  if (material.estado === 'en_reparacion' || material.estado === 'baja') return false
  return material.cantidadDisponible >= cantidad
}

/** Materiales cuya cantidad disponible está por debajo del stockMinimo definido. */
export function alertasStockMinimo(materiales: Material[]): Material[] {
  return materiales.filter(m => m.stockMinimo != null && m.cantidadDisponible < m.stockMinimo)
}
