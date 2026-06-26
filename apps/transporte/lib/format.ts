export const eur = (n: number | null | undefined): string =>
  (n ?? 0).toLocaleString('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })

export const eur2 = (n: number | null | undefined): string =>
  (n ?? 0).toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })
