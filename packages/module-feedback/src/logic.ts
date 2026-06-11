// Lógica de feedback: agregación de valoraciones y totales de propinas. Funciones puras.
import type { Feedback, Propina, ResumenValoraciones } from './types'

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100
}

/** Resumen de valoraciones: conteo, promedio y distribución por nota (1..5). */
export function resumenValoraciones(feedbacks: Feedback[]): ResumenValoraciones {
  const conNota = feedbacks.filter(f => typeof f.nota === 'number') as Array<Feedback & { nota: number }>
  const conteo = conNota.length
  const suma = conNota.reduce((s, f) => s + f.nota, 0)
  const distribucion: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }
  for (const f of conNota) {
    if (distribucion[f.nota] !== undefined) distribucion[f.nota] += 1
  }
  return { conteo, promedio: conteo > 0 ? round2(suma / conteo) : 0, distribucion }
}

/** Suma de todas las propinas. */
export function totalPropinas(propinas: Propina[]): number {
  return round2(propinas.reduce((s, p) => s + p.importe, 0))
}

/** Suma de las propinas pagadas (estado 'pagada'). */
export function propinasPagadas(propinas: Propina[]): number {
  return round2(propinas.filter(p => p.estado === 'pagada').reduce((s, p) => s + p.importe, 0))
}
