// ────────────────────────────────────────────────────────────────────────────
// ITP por comunidad autónoma. PURO.
//
// El coste puerta abierta aplicaba el 7% de Andalucía a TODO el corpus, y las
// alertas del BOE traen subastas de cualquier provincia: una vivienda en
// Asturias (ITP 8%) salía con el impuesto de Andalucía — un número plausible
// y mal, que es el peor tipo de error de esta casa.
//
// La tabla recoge el tipo GENERAL de TPO para inmuebles de segunda mano — el
// del PRIMER TRAMO donde la escala es progresiva (`progresivo: true`), porque
// simular la escala entera exigiría mantener los cortes de 17 normativas.
// Cada coste calculado con ella deja un aviso con el tipo aplicado y la CCAA:
// los tipos reducidos (vivienda habitual, jóvenes, familia numerosa…) y los
// tramos altos se confirman a mano antes de pujar.
//
// Vigencia: tipos generales a 08/2026. Si una CCAA cambia su escala, se toca
// SOLO esta tabla (y el aviso sigue declarando el tipo usado).
// ────────────────────────────────────────────────────────────────────────────

import { provinciaCanonica } from './geo.ts'

export interface ItpAutonomico {
  ccaa: string
  /** Tanto por uno del tipo general (primer tramo si hay escala). */
  tipo: number
  /** La CCAA aplica escala por tramos: el tipo real puede ser mayor. */
  progresivo: boolean
}

const ITP_POR_CCAA: Record<string, Omit<ItpAutonomico, 'ccaa'> & { ccaa: string }> = {
  andalucia: { ccaa: 'Andalucía', tipo: 0.07, progresivo: false },
  aragon: { ccaa: 'Aragón', tipo: 0.08, progresivo: true },
  asturias: { ccaa: 'Asturias', tipo: 0.08, progresivo: true },
  baleares: { ccaa: 'Baleares', tipo: 0.08, progresivo: true },
  canarias: { ccaa: 'Canarias', tipo: 0.065, progresivo: false },
  cantabria: { ccaa: 'Cantabria', tipo: 0.09, progresivo: false },
  castilla_la_mancha: { ccaa: 'Castilla-La Mancha', tipo: 0.09, progresivo: false },
  castilla_y_leon: { ccaa: 'Castilla y León', tipo: 0.08, progresivo: true },
  cataluna: { ccaa: 'Cataluña', tipo: 0.1, progresivo: true },
  extremadura: { ccaa: 'Extremadura', tipo: 0.08, progresivo: true },
  galicia: { ccaa: 'Galicia', tipo: 0.08, progresivo: false },
  madrid: { ccaa: 'Madrid', tipo: 0.06, progresivo: false },
  murcia: { ccaa: 'Murcia', tipo: 0.08, progresivo: false },
  navarra: { ccaa: 'Navarra', tipo: 0.06, progresivo: false },
  pais_vasco: { ccaa: 'País Vasco', tipo: 0.07, progresivo: false },
  la_rioja: { ccaa: 'La Rioja', tipo: 0.07, progresivo: false },
  // Ley 5/2025 (en vigor 01/06/2026): general 10% → 9%, con 11% sobre 1M€.
  valenciana: { ccaa: 'C. Valenciana', tipo: 0.09, progresivo: true },
  ceuta_melilla: { ccaa: 'Ceuta y Melilla', tipo: 0.06, progresivo: false },
}

/** Provincia (canónica, minúscula sin tildes) → clave de CCAA de la tabla. */
const CCAA_POR_PROVINCIA: Record<string, keyof typeof ITP_POR_CCAA> = {
  // Andalucía
  almeria: 'andalucia', cadiz: 'andalucia', cordoba: 'andalucia', granada: 'andalucia',
  huelva: 'andalucia', jaen: 'andalucia', malaga: 'andalucia', sevilla: 'andalucia',
  // Aragón
  huesca: 'aragon', teruel: 'aragon', zaragoza: 'aragon',
  asturias: 'asturias',
  baleares: 'baleares', 'illes balears': 'baleares',
  'las palmas': 'canarias', 'santa cruz de tenerife': 'canarias', tenerife: 'canarias',
  cantabria: 'cantabria',
  // Castilla-La Mancha
  albacete: 'castilla_la_mancha', 'ciudad real': 'castilla_la_mancha', cuenca: 'castilla_la_mancha',
  guadalajara: 'castilla_la_mancha', toledo: 'castilla_la_mancha',
  // Castilla y León
  avila: 'castilla_y_leon', burgos: 'castilla_y_leon', leon: 'castilla_y_leon',
  palencia: 'castilla_y_leon', salamanca: 'castilla_y_leon', segovia: 'castilla_y_leon',
  soria: 'castilla_y_leon', valladolid: 'castilla_y_leon', zamora: 'castilla_y_leon',
  // Cataluña
  barcelona: 'cataluna', girona: 'cataluna', lleida: 'cataluna', tarragona: 'cataluna',
  badajoz: 'extremadura', caceres: 'extremadura',
  // Galicia
  'a coruna': 'galicia', coruna: 'galicia', lugo: 'galicia', ourense: 'galicia', pontevedra: 'galicia',
  madrid: 'madrid',
  murcia: 'murcia',
  navarra: 'navarra',
  // País Vasco (forales; el tipo general de las tres diputaciones coincide)
  alava: 'pais_vasco', araba: 'pais_vasco', bizkaia: 'pais_vasco', vizcaya: 'pais_vasco',
  gipuzkoa: 'pais_vasco', guipuzcoa: 'pais_vasco',
  'la rioja': 'la_rioja', rioja: 'la_rioja',
  // C. Valenciana
  alicante: 'valenciana', castellon: 'valenciana', valencia: 'valenciana',
  ceuta: 'ceuta_melilla', melilla: 'ceuta_melilla',
}

function normProvincia(p: string): string {
  return p
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[/,].*$/, '') // «Alicante/Alacant», «Valencia/València»
    .trim()
}

/**
 * Tipo GENERAL de ITP para la provincia del bien. `null` si la provincia no se
 * reconoce — quien llama decide su default y lo declara (nunca se adivina).
 */
export function itpGeneral(provincia: string | null | undefined): ItpAutonomico | null {
  if (!provincia) return null
  const canonica = provinciaCanonica(provincia) ?? provincia
  const clave = CCAA_POR_PROVINCIA[normProvincia(canonica)]
  if (!clave) return null
  const fila = ITP_POR_CCAA[clave]
  return { ccaa: fila.ccaa, tipo: fila.tipo, progresivo: fila.progresivo }
}
