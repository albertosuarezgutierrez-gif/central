// Formato dinero ESPAÑOL (regla global del monorepo): miles con punto, decimales con
// coma, símbolo € DETRÁS y pegado (sin espacio). Ej.: 2.162,49€
export const eur = (n: number | null | undefined): string =>
  (n ?? 0).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: 'always' }) + '€'

export const eur2 = eur
