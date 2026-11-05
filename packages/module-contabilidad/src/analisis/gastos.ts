// Gastos por categoría: grupo 6 agrupado por cuenta de 3 dígitos (62x, 64x…). PURO.
import { SEMILLA_PGC_PYMES } from '../partida/plan.ts'
import type { SumaCuenta } from './kpis.ts'

export type CategoriaGasto = { cuenta: string; nombre: string; importe: number; pct: number }
export type GastosPorCategoria = { categorias: CategoriaGasto[]; total: number }

const NOMBRES_3: Record<string, string> = Object.fromEntries(SEMILLA_PGC_PYMES.filter(([c]) => c.length === 3).map(([c, n]) => [c, n]))

/** Nombre de una cuenta de 3 dígitos del PGC pymes de la semilla; si no está, «Cuenta 6xx». */
export const nombreCuenta3 = (c3: string): string => NOMBRES_3[c3] ?? `Cuenta ${c3}`

/**
 * Gasto neto (debe − haber) por cuenta de 3 dígitos del grupo 6, de mayor a menor. `null` = ningún apunte del grupo 6 (sin datos).
 * Las categorías con neto ≤ 0 (p. ej. solo devoluciones) no se pintan en la tarta pero SÍ restan del total de gasto.
 * `pct` = % sobre la suma de las categorías positivas, 1 decimal.
 */
export function gastosPorCategoria(sumas: readonly SumaCuenta[], nombres: Readonly<Record<string, string>> = {}): GastosPorCategoria | null {
  const m = new Map<string, number>()
  let n = 0
  for (const s of sumas) {
    if (!s.cuenta.startsWith('6')) continue
    n += s.n
    const k = s.cuenta.slice(0, 3)
    m.set(k, (m.get(k) ?? 0) + s.debe - s.haber)
  }
  if (n === 0) return null
  const positivas = [...m.entries()].filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))
  const base = positivas.reduce((t, [, v]) => t + v, 0)
  const total = [...m.values()].reduce((t, v) => t + v, 0)
  return {
    total,
    categorias: positivas.map(([cuenta, importe]) => ({ cuenta, nombre: nombres[cuenta] ?? nombreCuenta3(cuenta), importe, pct: Math.round((importe * 1000) / base) / 10 })),
  }
}
