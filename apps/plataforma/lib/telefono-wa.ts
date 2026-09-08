/**
 * ¿Este teléfono se puede abrir en WhatsApp, y con qué URL?
 *
 * Módulo PURO (sin red, sin env, sin BD): lo consume la UI de `/correduria`
 * para pintar el icono de WhatsApp al lado de los móviles del cliente.
 *
 * 🚨 Aquí manda la regla del CLAUDE.md raíz «dato que NO hay ≠ dato que NO se
 * ha mirado», aplicada a una ACCIÓN: `null` NO significa «no tiene WhatsApp»,
 * significa **«no se puede afirmar que este número sea un móvil»**. Y como no
 * se puede afirmar, la UI **no pinta nada** — ni un enlace que abra un chat con
 * un fijo (WhatsApp lo acepta y muestra «el número no está en WhatsApp», así
 * que el error solo se ve DESPUÉS de haber pulsado), ni un icono en gris que
 * prometa una acción que no existe. El teléfono sigue estando en pantalla con
 * su `tel:`, que es lo que sí se sabe que funciona.
 *
 * Qué se considera móvil español: 9 dígitos que empiezan por 6 o 7 (Plan
 * Nacional de Numeración). Un fijo (9x, 8x) NO lo es, aunque sea un número
 * perfectamente válido al que llamar.
 */

/**
 * Quita lo que la gente escribe entre los dígitos (espacios de todo tipo,
 * puntos, guiones, paréntesis y barras). NO toca el `+` inicial: es lo único
 * que distingue un prefijo internacional de nueve dígitos sueltos.
 */
function limpiar(telefono: string): string {
  return telefono.replace(/[\s.\-()/]/g, '')
}

/**
 * El número NACIONAL español de 9 dígitos, o `null` si esto no es un teléfono
 * español que se pueda leer. Acepta `+34`, `0034`, `34` y el número a secas.
 */
function nacionalEs(telefono: string): string | null {
  const limpio = limpiar(telefono)
  // Un `+` en medio, letras o extensiones («612345678 ext 4») no se interpretan:
  // adivinar cuál es el número de verdad es justo lo que no se puede afirmar.
  if (!/^\+?\d+$/.test(limpio)) return null
  const digitos = limpio.replace(/^\+/, '')
  if (/^\d{9}$/.test(digitos)) return digitos
  if (/^(?:0034|34)\d{9}$/.test(digitos)) return digitos.slice(-9)
  return null
}

/**
 * ¿Es un móvil español? Normaliza el formato y acepta prefijo `+34`/`0034`/`34`;
 * solo dice que sí con 9 dígitos nacionales que empiecen por 6 o 7.
 */
export function esMovilEs(telefono: string): boolean {
  const nacional = nacionalEs(telefono)
  return nacional !== null && /^[67]/.test(nacional)
}

/**
 * La URL de WhatsApp del número, o `null` si no se puede afirmar que sea un
 * móvil.
 *
 * · Móvil español → `https://wa.me/34XXXXXXXXX` (wa.me quiere el número con
 *   prefijo de país y sin `+` ni separadores).
 * · Número con prefijo internacional distinto de 34 (`+351…`, `0049…`) → se
 *   devuelve tal cual **si tiene entre 8 y 15 dígitos** (E.164 topa en 15).
 *   Fuera de España no hay forma de saber qué rangos son móviles sin una tabla
 *   por país, así que se acepta el número plausible y se declara ese límite
 *   aquí en vez de fingir una certeza que no se tiene.
 * · Cualquier otra cosa (fijo español, número corto, cadena vacía, texto) →
 *   `null`, y la UI no pinta el icono.
 */
export function urlWhatsapp(telefono: string): string | null {
  const nacional = nacionalEs(telefono)
  if (nacional !== null) return /^[67]/.test(nacional) ? `https://wa.me/34${nacional}` : null

  const limpio = limpiar(telefono)
  // Sin prefijo internacional explícito no hay país que poner, y wa.me sin país
  // no abre nada.
  if (!/^(?:\+|00)\d+$/.test(limpio)) return null
  const digitos = limpio.replace(/^(?:\+|00)/, '')
  // Un +34 que llega hasta aquí ya se ha juzgado arriba y NO era móvil español:
  // no se cuela por la puerta de «extranjero plausible».
  if (digitos.startsWith('34')) return null
  if (!/^\d{8,15}$/.test(digitos)) return null
  return `https://wa.me/${digitos}`
}
