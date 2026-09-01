// Formato de dinero ESPAÑOL, regla global del monorepo: `2.162,49€`
// (miles con punto, decimales con coma, € DETRÁS). Nunca `€2162.49`.
// Espejo exacto de apps/asegura/lib/dinero.ts.
export function eur(n: number | null | undefined): string {
  // OJO (regla «dato que NO hay ≠ dato que NO se ha mirado»): null aquí NO es 0.
  // Una prima que la IA no supo leer pintada como `0,00€` sería una afirmación
  // falsa; el guion dice «todavía no lo sabemos».
  if (n === null || n === undefined || Number.isNaN(n)) return '—'
  return (
    n.toLocaleString('es-ES', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
      useGrouping: 'always',
    }) + '€'
  )
}
