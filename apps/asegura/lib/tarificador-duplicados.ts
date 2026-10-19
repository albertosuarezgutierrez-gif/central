// Formas del riesgo contra las que se detecta un duplicado al encolar (19/10/2026). Puro.
import { riesgoSinDatosPersonales } from '@central/module-tarificacion'

/**
 * Un `ok` ya purgó su riesgo a la lista blanca, así que el duplicado se busca también contra esa forma. EXCEPTO en hogar:
 * su purga deja solo {"ramo":"hogar"}, que no distingue una vivienda de otra, y cualquier petición nueva (otra vivienda)
 * se tomaría por duplicada y devolvería el precio ajeno. Hogar solo se compara con riesgos NO purgados idénticos.
 */
export function formasRiesgoDuplicado(riesgo: Record<string, unknown>, ramo: string): { riesgoJson: string; riesgoPurgadoJson: string | null } {
  const riesgoJson = JSON.stringify(riesgo)
  if (ramo === 'hogar') return { riesgoJson, riesgoPurgadoJson: null }
  return { riesgoJson, riesgoPurgadoJson: JSON.stringify(riesgoSinDatosPersonales(riesgo, ramo as Parameters<typeof riesgoSinDatosPersonales>[1])) }
}
