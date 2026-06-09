import type { Apunte, IVATrimestral } from './types'

/** Redondea a 2 decimales (igual que SQL ROUND(x, 2)). */
export function round2(n: number): number {
  return Math.round(n * 100) / 100
}

/**
 * Calcula la cuota de IVA a partir de la base imponible y el porcentaje.
 * Equivalente a SQL: ROUND(base * pct / 100, 2)
 */
export function calcularCuotaIva(base: number, porcentaje: number): number {
  return Math.round(base * porcentaje) / 100
}

/**
 * Calcula el total (base + cuota), redondeado a 2 decimales.
 */
export function calcularTotal(base: number, cuota: number): number {
  return round2(base + cuota)
}

/**
 * Agrega el IVA trimestral para un año a partir de un array de apuntes.
 * Devuelve los 4 trimestres aunque no haya movimientos (a_liquidar = 0).
 */
export function calcularIVA(apuntes: Apunte[], anio: number): IVATrimestral[] {
  const delAnio = apuntes.filter(a => a.fecha.getFullYear() === anio)
  return [1, 2, 3, 4].map(trimestre => {
    const mesesQ = [trimestre * 3 - 2, trimestre * 3 - 1, trimestre * 3]
    const deQ = delAnio.filter(a => mesesQ.includes(a.fecha.getMonth() + 1))
    const iva_repercutido = round2(
      deQ.filter(a => a.tipo === 'ingreso').reduce((s, a) => s + a.cuota_iva, 0)
    )
    const iva_soportado = round2(
      deQ.filter(a => a.tipo === 'gasto').reduce((s, a) => s + a.cuota_iva, 0)
    )
    return {
      anio,
      trimestre,
      iva_repercutido,
      iva_soportado,
      a_liquidar: round2(iva_repercutido - iva_soportado),
    }
  })
}
