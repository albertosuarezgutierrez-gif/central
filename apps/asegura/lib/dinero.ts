// Formato de dinero ESPAÑOL, regla global del monorepo: `2.162,49€`
// (miles con punto, decimales con coma, € DETRÁS). Nunca `€2162.49`.
// Espejo de apps/plataforma/lib/dinero.ts — las primas y recibos de la
// correduría se pintan con esto, en pantalla, en Telegram y en emails.
export function eur(n: number | null | undefined): string {
  // OJO (regla «dato que NO hay ≠ dato que NO se ha mirado»): null aquí NO es 0.
  // Devolvemos un guion para que la UI no afirme «0,00€» sobre un importe que
  // simplemente todavía no se ha leído de la compañía.
  if (n === null || n === undefined || Number.isNaN(n)) return '—'
  return (
    n.toLocaleString('es-ES', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
      useGrouping: 'always',
    }) + '€'
  )
}
