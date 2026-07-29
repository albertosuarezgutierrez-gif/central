// ────────────────────────────────────────────────────────────────────────────
// Municipio → provincia. PURO.
//
// Por qué existe: `provinciaDeTexto` de @central/module-concursos resuelve
// NOMBRES DE PROVINCIA, pero las descripciones del BOE citan el MUNICIPIO
// («Dos Hermanas», «Belmonte de Miranda», «El Puerto de Santa María») y a veces
// mandan una descripción plantilla sin ningún topónimo — ahí el único indicio es
// el nombre de la búsqueda guardada que disparó la alerta.
//
// Cubre las zonas que Alberto vigila. Añadir una zona = añadir una fila.
// ────────────────────────────────────────────────────────────────────────────

import { norm } from './parsing.ts'

/** Patrones de municipio/comarca por provincia. Se comparan sobre texto normalizado. */
export const MUNICIPIOS_POR_PROVINCIA: Array<[string, RegExp]> = [
  [
    'Huelva',
    /matalascanas|almonte|mazagon|moguer|punta umbria|isla cristina|lepe|cartaya|el rompido|islantilla|ayamonte|palos de la frontera|aljaraque|huelva/,
  ],
  [
    'Cádiz',
    /puerto de santa maria|puerto santamaria|el puerto de sta|jerez|chiclana|conil|rota\b|sanlucar|barbate|vejer|algeciras|cadiz/,
  ],
  [
    'Sevilla',
    /dos hermanas|camas\b|alcala de guadaira|mairena|tomares|bormujos|utrera|ecija|carmona|moron de la frontera|castilleja|espartinas|gines\b|san juan de aznalfarache|sevilla/,
  ],
  ['Asturias', /belmonte de miranda|pravia|oviedo|gijon|aviles|langreo|mieres|siero|llanes|asturias/],
]

/**
 * Deduce la provincia de un texto libre (descripción del bien y/o nombre de la
 * búsqueda guardada). Devuelve `null` si no hay indicio — nunca adivina.
 */
export function provinciaPorMunicipio(...textos: Array<string | null | undefined>): string | null {
  const t = norm(textos.filter(Boolean).join(' '))
  if (!t) return null
  for (const [provincia, re] of MUNICIPIOS_POR_PROVINCIA) {
    if (re.test(t)) return provincia
  }
  return null
}
