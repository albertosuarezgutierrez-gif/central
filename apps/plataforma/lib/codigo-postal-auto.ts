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

/** El municipio de la lista que ES la ciudad escrita (sin tildes ni mayúsculas), o `null`. */
export function ciudadDelCp(municipios: string[] | null, ciudad: string): string | null {
  const c = plano(ciudad)
  if (!c || !municipios) return null
  return municipios.find((m) => plano(m) === c) ?? null
}

export function decidirCiudad(municipios: string[] | null, ciudadActual: string): DecisionCiudad {
  if (!municipios || municipios.length === 0) return null
  if (municipios.length === 1) return { ciudad: municipios[0], elegir: false }
  const casa = ciudadDelCp(municipios, ciudadActual)
  return casa ? { ciudad: casa, elegir: false } : { ciudad: '', elegir: true }
}

export const cpCompleto = (cp: string) => /^\d{5}$/.test(cp.trim())
