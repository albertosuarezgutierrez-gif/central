// Dinero en formato español para las pantallas de nóminas: 2162.49 → «2.162,49€» (punto de miles también en 4 cifras,
// coma decimal, € detrás). Mismo criterio que `eur()` de plataforma (`apps/plataforma/lib/dinero.ts`). Puro.
export function eur(n: number | string | null | undefined): string {
  const num = n == null || n === '' ? NaN : Number(n)
  if (!Number.isFinite(num)) return '—'
  return `${num.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: 'always' })}€`
}

/** Céntimos enteros → «1.234,56€». */
export function eurCent(c: number | null | undefined): string {
  return c == null || !Number.isFinite(c) ? '—' : eur(c / 100)
}
