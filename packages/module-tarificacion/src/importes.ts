// Importes en el formato de los portales españoles (puntos de miles, coma decimal). PURO.
// Fail-closed: lo que no es un importe inequívoco devuelve `null` (nunca 0, nunca «lo más parecido»).

const CON_MILES = /^-?\d{1,3}(\.\d{3})+(,\d+)?$/
const SIN_MILES = /^-?\d+(,\d+)?$/

/** «12.000,00» → 12000 · «347,55 €» → 347.55 · «250» → 250 · «Incluida», «», «1,2,3», «12.5» → null. */
export function importeEs(texto: string | null | undefined): number | null {
  if (typeof texto !== 'string') return null
  const t = texto.replace(/[€\s ]/g, '')
  if (!CON_MILES.test(t) && !SIN_MILES.test(t)) return null
  const n = Number(t.replace(/\./g, '').replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

/**
 * Importe de la pestaña «Tarificar» de ePAC: PUNTO decimal y sin separador de miles («296.71»,
 * «343.74»). Distinto de `importeEs`: «1.234» aquí sería 1,234. Fail-closed: con coma, con
 * miles o con basura → `null`.
 */
export function importePuntoDecimal(texto: string | null | undefined): number | null {
  if (typeof texto !== 'string') return null
  const t = texto.replace(/[€\s ]/g, '')
  if (!/^-?\d+(\.\d{1,2})?$/.test(t)) return null
  const n = Number(t)
  return Number.isFinite(n) ? n : null
}
