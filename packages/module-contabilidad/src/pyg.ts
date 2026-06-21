import type { Apunte, ResultadoMensual } from './types'
import { round2 } from './iva'

/**
 * Calcula el Resultado (PyG) mensual para un año a partir de un array de apuntes.
 * Devuelve los 12 meses aunque no haya movimientos (beneficio = 0).
 */
export function calcularPyG(apuntes: Apunte[], anio: number): ResultadoMensual[] {
  const delAnio = apuntes.filter(a => a.fecha.getFullYear() === anio)
  return Array.from({ length: 12 }, (_, i) => i + 1).map(mes => {
    const delMes = delAnio.filter(a => a.fecha.getMonth() + 1 === mes)
    const ingresos_base = round2(
      delMes.filter(a => a.tipo === 'ingreso').reduce((s, a) => s + a.base_imponible, 0)
    )
    const gastos_base = round2(
      delMes.filter(a => a.tipo === 'gasto').reduce((s, a) => s + a.base_imponible, 0)
    )
    const beneficio = round2(ingresos_base - gastos_base)
    const margen_pct = ingresos_base > 0
      ? Math.round((beneficio / ingresos_base) * 1000) / 10
      : null
    return { anio, mes, ingresos_base, gastos_base, beneficio, margen_pct }
  })
}
