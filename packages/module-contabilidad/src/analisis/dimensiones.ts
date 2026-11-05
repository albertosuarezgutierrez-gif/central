// Rentabilidad por DIMENSIÓN (eje configurable por sector: ot, cliente, tipo_trabajo, mecanico, proveedor, mesa…). PURO.
// El núcleo solo conoce «dimensiones»: clave → valor. Los apuntes sin esa dimensión NO se esconden: salen como `valor: null`
// («sin asignar»). ingresos/gastos `null` = ningún apunte de ese grupo (no es lo mismo que 0).
import type { Asiento } from '../partida/asiento.ts'
import type { Periodo } from '../partida/libros.ts'

export const DIMENSION_RE = /^[a-z][a-z0-9_]{1,30}$/
export const MAX_VALOR_DIMENSION = 60

export type FilaDimension = { valor: string | null; cuenta: string; debe: number; haber: number }

export type RentabilidadDimension = {
  valor: string | null
  ingresos: number | null
  gastos: number | null
  /** ingresos − gastos (el que falte cuenta como 0 al restar, pero sigue visible como null). */
  margen: number
  margenPct: number | null
  /** Nº de apuntes de 6/7 que entran. */
  n: number
}

/** Filas agrupadas (valor, cuenta) de los apuntes de gasto/ingreso con esa dimensión, a partir de asientos. */
export function filasPorDimension(asientos: readonly Asiento[], dimension: string, periodo?: Periodo): FilaDimension[] {
  if (!DIMENSION_RE.test(dimension)) throw new RangeError(`dimensión no válida: ${dimension}`)
  const m = new Map<string, FilaDimension>()
  for (const a of asientos) {
    if ((periodo?.desde && a.fecha < periodo.desde) || (periodo?.hasta && a.fecha > periodo.hasta)) continue
    for (const p of a.apuntes) {
      if (p.cuenta[0] !== '6' && p.cuenta[0] !== '7') continue
      const v = p.dimensiones?.[dimension] ?? a.dimensiones?.[dimension]
      const valor = typeof v === 'string' && v.trim() ? v.trim() : null
      const k = `${valor ?? '\u0000'}|${p.cuenta}`
      const x = m.get(k) ?? { valor, cuenta: p.cuenta, debe: 0, haber: 0 }
      x.debe += p.debe; x.haber += p.haber
      m.set(k, x)
    }
  }
  return [...m.values()]
}

/** De mejor a peor margen; «sin asignar» siempre el último. */
export function rentabilidadDeFilas(filas: readonly FilaDimension[]): RentabilidadDimension[] {
  const por = new Map<string | null, { ing: number; gas: number; hayIng: boolean; hayGas: boolean; n: number }>()
  for (const f of filas) {
    const x = por.get(f.valor) ?? { ing: 0, gas: 0, hayIng: false, hayGas: false, n: 0 }
    if (f.cuenta[0] === '7') { x.ing += f.haber - f.debe; x.hayIng = true } else if (f.cuenta[0] === '6') { x.gas += f.debe - f.haber; x.hayGas = true } else continue
    x.n += 1
    por.set(f.valor, x)
  }
  const salida = [...por.entries()].map(([valor, x]): RentabilidadDimension => {
    const ingresos = x.hayIng ? x.ing : null
    const gastos = x.hayGas ? x.gas : null
    const margen = (ingresos ?? 0) - (gastos ?? 0)
    return { valor, ingresos, gastos, margen, margenPct: ingresos === null || ingresos <= 0 ? null : Math.round((margen * 1000) / ingresos) / 10, n: x.n }
  })
  return salida.sort((a, b) => (a.valor === null ? 1 : 0) - (b.valor === null ? 1 : 0) || b.margen - a.margen || String(a.valor).localeCompare(String(b.valor), 'es'))
}

export const rentabilidadPorDimension = (asientos: readonly Asiento[], dimension: string, periodo?: Periodo): RentabilidadDimension[] =>
  rentabilidadDeFilas(filasPorDimension(asientos, dimension, periodo))
