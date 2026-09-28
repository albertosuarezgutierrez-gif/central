/**
 * Qué hacer con la ciudad cuando el CP resuelve a municipios (puro, sin BD).
 *
 * - Un municipio → se pone ese.
 * - Varios → si la ciudad escrita ya es uno de ellos, se respeta (con la grafía
 *   de la tabla); si no, se vacía y se obliga a ELEGIR: dejar la ciudad vieja
 *   junto a un CP nuevo es justo la ficha incoherente que se quiere evitar
 *   (41011 + «ESPARTINAS»: 41011 es Sevilla capital).
 * - `null` (CP desconocido) → no se toca nada: «no lo sé» no autoriza a borrar.
 */
export type DecisionCiudad = { ciudad: string; elegir: boolean } | null

const plano = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim()

export function decidirCiudad(municipios: string[] | null, ciudadActual: string): DecisionCiudad {
  if (!municipios || municipios.length === 0) return null
  if (municipios.length === 1) return { ciudad: municipios[0], elegir: false }
  const actual = plano(ciudadActual)
  const casa = actual ? municipios.find((m) => plano(m) === actual) : undefined
  return casa ? { ciudad: casa, elegir: false } : { ciudad: '', elegir: true }
}

export const cpCompleto = (cp: string) => /^\d{5}$/.test(cp.trim())
