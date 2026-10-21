// Normalización de las notas internas de la ficha del empleado. Módulo PURO.
// Solo las ve la empresa (panel admin): jamás salen en /api/e/* ni /e/*.

export const NOTAS_MAX = 5000

export type NotasNormalizadas = { ok: true; valor: string | null } | { ok: false; error: string }

/** Recorta espacios; vacío → null (nunca ''); más de NOTAS_MAX → error; no string → error. */
export function normalizarNotas(valor: unknown): NotasNormalizadas {
  if (valor === null) return { ok: true, valor: null }
  if (typeof valor !== 'string') return { ok: false, error: 'Las notas deben ser texto' }
  const t = valor.trim()
  if (t.length > NOTAS_MAX) return { ok: false, error: `Las notas no pueden superar ${NOTAS_MAX} caracteres` }
  return { ok: true, valor: t === '' ? null : t }
}
