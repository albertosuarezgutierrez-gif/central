// Lógica de disponibilidad de la agenda: detección de solapes y filtrado de recursos
// disponibles en un intervalo. Funciones puras (sin BD).
import type { Intervalo, Recurso, Reserva } from './types'

function ms(iso: string): number {
  return Date.parse(iso)
}

/** ¿Se solapan dos intervalos [inicio, fin)? (contiguos no solapan). */
export function haySolape(a: Intervalo, b: Intervalo): boolean {
  return ms(a.inicio) < ms(b.fin) && ms(b.inicio) < ms(a.fin)
}

/**
 * ¿Está el recurso libre en `intervalo`, dadas sus reservas?
 * Por defecto ignora las reservas canceladas.
 */
export function recursoDisponible(
  reservas: Reserva[],
  intervalo: Intervalo,
  opts: { incluirCanceladas?: boolean } = {},
): boolean {
  return !reservas.some(
    r =>
      (opts.incluirCanceladas || r.estado !== 'cancelada') &&
      haySolape({ inicio: r.inicio, fin: r.fin }, intervalo),
  )
}

/** Filtra los recursos activos que están libres en `intervalo`. */
export function recursosDisponibles(
  recursos: Recurso[],
  reservasPorRecurso: Record<string, Reserva[]>,
  intervalo: Intervalo,
): Recurso[] {
  return recursos.filter(
    rec => rec.activo && recursoDisponible(reservasPorRecurso[rec.id] ?? [], intervalo),
  )
}
