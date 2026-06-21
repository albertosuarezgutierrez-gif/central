// ────────────────────────────────────────────────────────────────────────────
// "¿Me conviene?" — semáforo PURO de encaje de un anuncio con los criterios del
// radar de la empresa (CPV por prefijo, palabras clave, rango de presupuesto).
// Determinista, sin IA. Complementa al resumen IA del buscador.
// ────────────────────────────────────────────────────────────────────────────

import type { AnuncioRadar, CriteriosRadar } from './types'

export type Encaje = 'verde' | 'ambar' | 'rojo'

/** Normaliza para comparar palabras clave sin acentos ni mayúsculas. */
const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '')

/**
 * Devuelve el encaje del anuncio con los criterios: `verde` (CPV encaja y el
 * presupuesto, si se conoce, cae en rango), `ambar` (encaja por CPV pero el
 * presupuesto se sale, o solo casa por palabra clave) o `rojo` (no casa).
 * Devuelve `null` si no hay criterios suficientes para juzgar.
 */
export function encajeConcurso(anuncio: AnuncioRadar, criterios: CriteriosRadar): Encaje | null {
  const cpvCrit = (criterios.cpv ?? []).map(s => String(s).trim()).filter(Boolean)
  const kws = (criterios.palabras_clave ?? []).map(s => norm(String(s).trim())).filter(Boolean)
  if (!cpvCrit.length && !kws.length) return null

  const cpvAnuncio = (anuncio.cpv ?? []).map(s => String(s))
  const cpvMatch = cpvCrit.length > 0 && cpvAnuncio.some(a => cpvCrit.some(p => a.startsWith(p)))

  const texto = norm(`${anuncio.titulo ?? ''} ${anuncio.objeto ?? ''}`)
  const kwMatch = kws.length > 0 && kws.some(k => texto.includes(k))

  const min = criterios.presupuesto_min ?? null
  const max = criterios.presupuesto_max ?? null
  const p = anuncio.presupuesto ?? null
  const presFuera = p != null && ((min != null && p < min) || (max != null && p > max))

  if (cpvMatch && !presFuera) return 'verde'
  if ((cpvMatch && presFuera) || (!cpvMatch && kwMatch)) return 'ambar'
  return 'rojo'
}
