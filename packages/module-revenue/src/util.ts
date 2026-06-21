// Helpers puros de fecha y estadística. UTC en todo para ser determinista.

const DAY_MS = 86_400_000

/** Día de la semana en UTC: 0=domingo … 6=sábado. */
export function dow(d: Date): number {
  return d.getUTCDay()
}

/** Mes en UTC: 1..12. */
export function monthOf(d: Date): number {
  return d.getUTCMonth() + 1
}

/** Días enteros entre `a` y `b` (b - a), redondeado. */
export function daysBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / DAY_MS)
}

/** Nº de unidades (noches/servicios) de un evento. */
export function nightsOf(ev: { start: Date; end?: Date; quantity?: number }): number {
  if (ev.quantity != null && ev.quantity > 0) return ev.quantity
  if (ev.end) return Math.max(1, daysBetween(ev.start, ev.end))
  return 1
}

/** Media aritmética; NaN si vacío. */
export function mean(xs: number[]): number {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN
}

/** Percentil (interpolación lineal) sobre un array ascendente. */
export function percentile(sortedAsc: number[], q: number): number {
  if (sortedAsc.length === 0) return NaN
  if (sortedAsc.length === 1) return sortedAsc[0]
  const idx = Math.min(1, Math.max(0, q)) * (sortedAsc.length - 1)
  const lo = Math.floor(idx)
  const hi = Math.ceil(idx)
  if (lo === hi) return sortedAsc[lo]
  return sortedAsc[lo] + (sortedAsc[hi] - sortedAsc[lo]) * (idx - lo)
}
