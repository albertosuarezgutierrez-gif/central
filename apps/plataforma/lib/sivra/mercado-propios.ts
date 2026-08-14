// lib/sivra/mercado-propios.ts — NUESTROS propios anuncios NO son comparables de mercado.
//
// POR QUÉ (14/08/2026). Midiendo con el conector de Booking las fechas de evento congeladas, la
// búsqueda de "apartamentos en Sevilla para 12 adultos" devolvió, entre los resultados, **nuestro
// propio anuncio** («HOUSE SEVILLANA 6 habitaciones», Calle Socorro 24). Escribirlo en
// `market_rates` como comparable de `prop_house_sevillana` es comparar el piso consigo mismo: el
// ancla de mercado pasa a contener el precio que ese mismo motor acaba de poner, y el sistema se
// realimenta. Con 9-10 comps por ventana, uno propio mueve la mediana lo justo para empujar el
// precio en la dirección en la que ya iba — un bucle silencioso, sin dato que delate el fallo.
//
// Esto NO lo resuelve el `fuente='booking_mcp'`: el precio es real y de la fecha correcta. Lo que
// está mal es de QUIÉN es. Y no basta con escribirlo en la skill de la rutina: una instrucción en
// prosa depende de que el agente de turno se acuerde, mientras que el corpus lo escribe SIEMPRE
// este endpoint. Mismo criterio que la validación de `fuente` en `/api/sivra/mercado/ingest`
// («un centinela que acepta cualquier etiqueta no vigila nada»): el raíl va en el código.
//
// 🚨 La lista es CURADA a propósito, no heurística. Un falso positivo aquí es el fallo simétrico y
// peor: descarta en silencio un comparable legítimo de la competencia y adelgaza el corpus de la
// fecha justo por debajo del umbral que descongela un evento. Por eso NO se comparan tokens
// sueltos («sevillana», «busto» — hay competencia real en Calle Bustos Tavera, p. ej. «Monkeys
// Apartments Casa Palacio Bustos Tavera», que SÍ es mercado) sino nombres completos y distintivos
// tal y como aparecen publicados en el portal. Se añade una entrada cuando se ve el anuncio propio
// en una respuesta real, no por si acaso.

/** Normaliza para comparar: sin acentos, minúsculas, sin puntuación y con espacios colapsados. */
export function normalizarNombre(nombre: string): string {
  return nombre
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/**
 * Nombres (ya normalizados) con los que NUESTROS pisos aparecen publicados en los portales.
 *
 * Hoy solo House Sevillana: es el único de los cuatro que se ha visto salir en una búsqueda del
 * conector. Los otros tres (Busto Reform, Duplex Center, Luxury Busto) no han aparecido nunca en
 * los resultados; cuando alguno lo haga, se añade aquí SU nombre de portal —no el nombre interno
 * de `pricing_piso_zona`, que no es el que publica Booking.
 */
export const ANUNCIOS_PROPIOS: readonly string[] = [
  'house sevillana',
]

/**
 * ¿Este comparable es en realidad un anuncio nuestro?
 *
 * Coincide por prefijo/inclusión del nombre curado dentro del nombre publicado, porque el portal le
 * cuelga sufijos comerciales que cambian solos («HOUSE SEVILLANA 6 habitaciones»). La comparación
 * es sobre texto normalizado, así que da igual el uso de mayúsculas o los acentos.
 */
export function esAnuncioPropio(nombre: string): boolean {
  const n = normalizarNombre(nombre)
  if (!n) return false
  return ANUNCIOS_PROPIOS.some(propio => n.includes(propio))
}
