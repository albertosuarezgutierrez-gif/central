// ¿Este comparable es una CASA ENTERA, o una unidad de aparthotel/hotel vestida de "apartamento"?
//
// ── POR QUÉ (19/09/2026) ─────────────────────────────────────────────────────────────────────
// La queja de un huésped de House Sevillana («la web sale más cara que Booking») llevó a mirar de
// qué está hecho el corpus de comparables para aforo 12. El filtro del conector
// (`accommodation_types: ["APARTMENT"]`, skill `mercado-booking`) NO separa una casa de 6
// dormitorios de una unidad dentro de un edificio con recepción: medido el 19/09/2026 sobre los
// últimos 14 días, los comparables que MÁS pesan por frecuencia (59, 50, 44, 41... apariciones)
// son aparthoteles y hasta HOTELES literales — Overland Suites Catedral, Singular Corral de San
// José, Sercotel Sevilla Guadalquivir Suites, Hilton Garden Inn Sevilla, Meliá Sevilla, Hotel San
// Gil Sevilla — mientras las casas enteras reales (Cheerful 6 Bedroom House, Casa Sevillana,
// Charming 6 Bed Sleeps 12...) aparecen 3-8 veces cada una. Quien busca "una casa entera para el
// grupo" —el perfil exacto del huésped que se quejó— no compra lo mismo que quien reserva una
// habitación de hotel, y el ancla de precio del motor no debería anclarse a ese producto distinto.
//
// ── LA REGLA ──────────────────────────────────────────────────────────────────────────────────
// Se descarta un comparable SOLO con señal POSITIVA de que es una unidad de aparthotel/hotel/
// residencia (palabra de marca o de categoría en el nombre). Sin esa señal, entra: no hay forma de
// saber por el nombre que "Casa Fulanito" es de verdad una casa entera más que suponerlo, así que
// el filtro es asimétrico igual que `pricing-comps-liga.ts` — pensado para QUITAR ruido evidente,
// nunca para adivinar quién SÍ es competencia.
//
// 🚨 Esto NO sustituye una clasificación perfecta (no hay campo de "tipo de alojamiento" en lo que
// devuelve el conector, solo el nombre del anuncio) y se sabe incompleto: marcas locales sin
// palabra de categoría en el nombre (p. ej. "atLumbreras16") no se cazan. Coge la mayoría de los
// casos medidos (10 de los ~20 comparables más frecuentes de aforo 12) sin arriesgar excluir una
// casa real por error — ver los tests con nombres REALES del corpus.
//
// Módulo PURO (sin BD ni `@/`), testeable con `node --test`.

/**
 * Palabras/fragmentos que, en el NOMBRE de un anuncio, señalan una unidad de aparthotel, hotel o
 * edificio de apartamentos gestionados — nunca una casa entera privada. Minúsculas, sin acentos
 * necesarios (la comparación ignora mayúsculas). Fragmentos, no palabras completas: "aparthotel"
 * ya contiene "hotel", así que no hace falta una entrada aparte.
 */
export const PALABRAS_NO_CASA = [
  'hotel',
  'hostal',
  'hostel',
  'suite',
  'apartments',
  'apartamentos',
  'residence',
  // Cadenas/marcas de Sevilla observadas en el corpus real que no llevan ninguna de las palabras
  // de arriba en el nombre pero son, igualmente, gestión multi-unidad, no una casa entera:
  'singular ',
  'reservaloen',
  'sercotel',
  // Hoteles cuya marca no contiene la palabra "hotel" (el conector los devuelve igual pese al
  // filtro `accommodation_types: ["APARTMENT"]` de la skill mercado-booking):
  'hilton',
  'melia',
  'meliá',
  'eurostars',
  'hesperia',
] as const

/** ¿El nombre de este comparable indica una casa entera (no una unidad de aparthotel/hotel)? */
export function esCasaComparable(nombre: string | null | undefined): boolean {
  if (nombre == null) return true
  const n = nombre.toLowerCase()
  return !PALABRAS_NO_CASA.some(p => n.includes(p))
}

/**
 * La MISMA regla, como condición SQL (Postgres `ILIKE ANY`). Úsala siempre en vez de escribirla a
 * mano — es la misma razón que `sqlCompPlausible`/`sqlCompDeNuestraLiga`: varios corpus sobre
 * `market_rates` y una sola definición de "esto no es competencia nuestra".
 *
 * `prefijo` es el alias de la tabla con el punto puesto (`'m.'`) o cadena vacía. No interpola nada
 * de fuera de este módulo (las palabras son literales de código, no datos), así que es seguro en
 * `Prisma.raw`.
 */
export function sqlCompEsCasaComparable(prefijo = ''): string {
  const nombre = `${prefijo}comp_name`
  const patrones = PALABRAS_NO_CASA.map(p => `'%${p}%'`).join(', ')
  return `(${nombre} IS NULL OR NOT (${nombre} ILIKE ANY (ARRAY[${patrones}])))`
}
