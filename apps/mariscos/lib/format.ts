// Formato dinero ESPAÑOL (regla global del monorepo): miles con punto, decimales con
// coma, símbolo € DETRÁS y pegado (sin espacio). Ej.: 2.162,49€
export const eur = (n: number | null | undefined): string =>
  (n ?? 0).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: 'always' }) + '€'

// Peso en kg, formato español con hasta 3 decimales. Ej.: 2,5 kg · 12,750 kg
export const kg = (n: number | null | undefined): string =>
  (n ?? 0).toLocaleString('es-ES', { minimumFractionDigits: 0, maximumFractionDigits: 3, useGrouping: 'always' }) + ' kg'

// Fecha ISO (YYYY-MM-DD) → dd/mm/aaaa. Vacío si null.
export const fecha = (iso: string | null | undefined): string => {
  if (!iso) return '—'
  const [y, m, d] = iso.slice(0, 10).split('-')
  return d && m && y ? `${d}/${m}/${y}` : iso
}
