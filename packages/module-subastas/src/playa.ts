// ────────────────────────────────────────────────────────────────────────────
// Radar 🏖️ segunda residencia: costa de Huelva. PURO.
// No es una lente de inversión: es uso propio. Aquí solo se decide si un
// inmueble está en la zona que busca Alberto — el criterio de "me gusta" es
// suyo, el agente solo se lo pone delante con los datos.
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
  const m = norm(municipio ?? '')
  if (m && MUNICIPIOS_PLAYA_HUELVA.some((x) => m === x || m.includes(x))) return true

  const texto = norm(descripcion ?? '')
  if (texto && NUCLEOS_PLAYA_HUELVA.some((x) => texto.includes(x))) return true

  // Los municipios también aparecen citados en la descripción cuando la fuente
  // no los estructura — pero solo cuentan si la provincia no contradice.
  const prov = norm(provincia ?? '')
  if (texto && (!prov || prov === 'huelva')) {
    return MUNICIPIOS_PLAYA_HUELVA.some((x) => texto.includes(x))
  }
  return false
}
