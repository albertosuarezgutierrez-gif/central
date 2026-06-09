import type { Apunte, ResumenTesoreria } from './types'
import { round2 } from './iva'

/**
 * Calcula el resumen de tesorería a partir de un array de apuntes.
 * - `saldo_realizado`: ingresos cobrados − gastos pagados
 * - `pendiente_cobro`: ingresos aún no cobrados
 * - `pendiente_pago`: gastos aún no pagados
 */
export function calcularTesoreria(apuntes: Apunte[]): ResumenTesoreria {
  const realizados = apuntes.filter(a => a.realizado)
  const pendientes = apuntes.filter(a => !a.realizado)

  const saldo_realizado = round2(
    realizados.reduce((s, a) => s + (a.tipo === 'ingreso' ? a.total : -a.total), 0)
  )
  const pendiente_cobro = round2(
    pendientes.filter(a => a.tipo === 'ingreso').reduce((s, a) => s + a.total, 0)
  )
  const pendiente_pago = round2(
    pendientes.filter(a => a.tipo === 'gasto').reduce((s, a) => s + a.total, 0)
  )

  return { saldo_realizado, pendiente_cobro, pendiente_pago }
}
