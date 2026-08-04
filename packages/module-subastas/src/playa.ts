// ────────────────────────────────────────────────────────────────────────────
// Radar 🏖️ segunda residencia: costa de Huelva y costa de Cádiz. PURO.
// No es una lente de inversión: es uso propio. Aquí solo se decide si un
// inmueble está en la zona que busca Alberto — el criterio de "me gusta" es
// suyo, el agente solo se lo pone delante con los datos.
//
// Cádiz se añadió el 30/07/2026 a petición de Alberto. Jerez NO entra aquí a
// propósito: no es costa, es inversión, y ya llega al radar por la vía normal
// (Cádiz está en las provincias de sus criterios). Meterlo en esta lente
// —que salta el filtro de precio y de descuento— convertiría cualquier piso de
// Jerez en un aviso, que es justo lo contrario de lo que hace útil el radar.
// ────────────────────────────────────────────────────────────────────────────

import { norm } from './parsing.ts'

/** Municipios del litoral de Huelva (término municipal completo). */
export const MUNICIPIOS_PLAYA_HUELVA = [
  'punta umbria',
  'lepe',
  'isla cristina',
  'ayamonte',
  'cartaya',
  'aljaraque',
  'palos de la frontera',
  'moguer',
  'almonte',
] as const

/**
 * Núcleos de playa que las descripciones citan aunque el municipio sea otro
 * (Matalascañas es Almonte, La Antilla es Lepe, El Rompido es Cartaya…).
 * Sirven para cazar el inmueble cuando la fuente no trae municipio.
 */
export const NUCLEOS_PLAYA_HUELVA = [
  'matalascanas',
  'la antilla',
  'islantilla',
  'el rompido',
  'el portil',
  'mazagon',
  'punta del moral',
  'isla canela',
  'la redondela',
  'nuevo portil',
] as const

/**
 * Municipios del litoral gaditano. Se dejan FUERA a propósito Algeciras y Los
 * Barrios (bahía industrial, no segunda residencia) y se incluye San Roque por
 * Sotogrande.
 */
export const MUNICIPIOS_PLAYA_CADIZ = [
  'chiclana de la frontera',
  'chiclana',
  'conil de la frontera',
  'conil',
  'vejer de la frontera',
  'vejer',
  'barbate',
  'tarifa',
  'rota',
  'chipiona',
  'sanlucar de barrameda',
  'el puerto de santa maria',
  'puerto de santa maria',
  'puerto real',
  'san fernando',
  'cadiz',
  'la linea de la concepcion',
  'san roque',
] as const

/**
 * Núcleos gaditanos que las descripciones citan aunque el municipio sea otro:
 * Zahara de los Atunes y Atlanterra son Barbate, Novo Sancti Petri y La Barrosa
 * son Chiclana, Los Caños de Meca y El Palmar son Vejer, Costa Ballena está a
 * caballo entre Rota y Chipiona, Sotogrande es San Roque.
 */
export const NUCLEOS_PLAYA_CADIZ = [
  'novo sancti petri',
  'sancti petri',
  'la barrosa',
  'el palmar',
  'los canos de meca',
  'canos de meca',
  'zahara de los atunes',
  'atlanterra',
  'bolonia',
  'valdevaqueros',
  'costa ballena',
  'sotogrande',
  'torreguadiaro',
  'puerto sherry',
  'valdelagrana',
] as const

/**
 * Sin tope de precio: decisión de Alberto (29/07/2026) — «soy capaz de pagar
 * más si es algo interesante». El volumen en estas zonas es bajo; se avisa de
 * TODO lo que entre y el precio va en el aviso para que decida él.
 */
export const TOPE_PLAYA: number | null = null

/**
 * ¿Está en la costa de Huelva? Municipio en la lista, o núcleo de playa citado
 * en la descripción/dirección. Los municipios grandes (Almonte, Moguer, Lepe…)
 * incluyen interior — mejor un falso positivo que perderse Matalascañas.
 */
export function esPlayaHuelva(
  municipio: string | null | undefined,
  descripcion?: string | null,
  provincia?: string | null,
): boolean {
  return enLitoral(municipio, descripcion, provincia, MUNICIPIOS_PLAYA_HUELVA, NUCLEOS_PLAYA_HUELVA, 'huelva')
}

/** ¿Está en la costa de Cádiz? Misma mecánica que Huelva. */
export function esPlayaCadiz(
  municipio: string | null | undefined,
  descripcion?: string | null,
  provincia?: string | null,
): boolean {
  return enLitoral(municipio, descripcion, provincia, MUNICIPIOS_PLAYA_CADIZ, NUCLEOS_PLAYA_CADIZ, 'cadiz')
}

/**
 * La lente 🏖️ completa: costa de Huelva **o** costa de Cádiz. Es la que deben
 * usar la app y el radar; las dos anteriores quedan para poder distinguir la
 * zona cuando hace falta nombrarla.
 */
export function esPlaya(
  municipio: string | null | undefined,
  descripcion?: string | null,
  provincia?: string | null,
): boolean {
  return esPlayaHuelva(municipio, descripcion, provincia) || esPlayaCadiz(municipio, descripcion, provincia)
}

/** Nombre de la costa para el texto del aviso. `null` si no es ninguna. */
export function costaDe(
  municipio: string | null | undefined,
  descripcion?: string | null,
  provincia?: string | null,
): 'Huelva' | 'Cádiz' | null {
  if (esPlayaHuelva(municipio, descripcion, provincia)) return 'Huelva'
  if (esPlayaCadiz(municipio, descripcion, provincia)) return 'Cádiz'
  return null
}

function enLitoral(
  municipio: string | null | undefined,
  descripcion: string | null | undefined,
  provincia: string | null | undefined,
  municipios: readonly string[],
  nucleos: readonly string[],
  provinciaNorm: string,
): boolean {
  const m = norm(municipio ?? '')
  if (m && municipios.some((x) => m === x || m.includes(x))) return true

  const texto = norm(descripcion ?? '')
  if (texto && nucleos.some((x) => texto.includes(x))) return true

  // Los municipios también aparecen citados en la descripción cuando la fuente
  // no los estructura — pero solo cuentan si la provincia no contradice.
  const prov = norm(provincia ?? '')
  if (texto && (!prov || prov === provinciaNorm)) {
    return municipios.some((x) => texto.includes(x))
  }
  return false
}
