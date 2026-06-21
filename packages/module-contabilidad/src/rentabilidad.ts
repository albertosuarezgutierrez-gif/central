import type { Apunte, RentabilidadEntidad } from './types'
import { round2 } from './iva'

/**
 * Calcula la rentabilidad agrupada por entidad (propiedad, evento, local…).
 * Los apuntes sin `entidad_id` se agrupan en una entrada con `entidad_id = undefined`.
 */
export function calcularRentabilidad(apuntes: Apunte[]): RentabilidadEntidad[] {
  const byEntidad = new Map<string | undefined, { ingresos: number; gastos: number }>()

  for (const a of apuntes) {
    const key = a.entidad_id
    const cur = byEntidad.get(key) ?? { ingresos: 0, gastos: 0 }
    if (a.tipo === 'ingreso') cur.ingresos += a.base_imponible
    else cur.gastos += a.base_imponible
    byEntidad.set(key, cur)
  }

  return Array.from(byEntidad.entries()).map(([entidad_id, { ingresos, gastos }]) => {
    const i = round2(ingresos)
    const g = round2(gastos)
    const beneficio = round2(i - g)
    const margen_pct = i > 0 ? Math.round((beneficio / i) * 1000) / 10 : null
    return { entidad_id, ingresos: i, gastos: g, beneficio, margen_pct }
  })
}
