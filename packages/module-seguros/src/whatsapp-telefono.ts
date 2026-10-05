// Teléfono de WhatsApp → forma canónica E.164 y → las formas con las que la cartera lo hashea
// (05/10/2026, canal WhatsApp entrante de la correduría). `aE164` vive en telefono-e164.ts (libphonenumber); aquí solo lo puro.
//
// Por qué dos funciones y no una:
//   · `aE164` da la identidad del número (`+34600123456`): es la clave de la CONVERSACIÓN.
//   · La cartera NO guarda E.164: `normalizarTelefono` (cliente-edicion.ts) deja los españoles en
//     9 dígitos sin prefijo y los extranjeros con `+`, y el índice ciego
//     (`computeTelefonoLookupHash`) hashea SOLO LOS DÍGITOS. Así que `+34600123456` y `600123456`
//     dan hashes DISTINTOS. Para encontrar la ficha hay que probar todas las formas en que ese
//     número puede estar escrito en la base (`formasHashTelefono`). El hash no se toca.

/**
 * E.164 → como lo escribe la FICHA (`normalizarTelefono`): español en 9 dígitos, extranjero con `+`.
 * Es el valor que se cifra en `clientes.telefono` al dar de alta un lead y cuyo hash es el
 * principal. `null` si no es E.164.
 */
export function telefonoParaFicha(e164: string | null | undefined): string | null {
  if (typeof e164 !== 'string' || !/^\+\d{8,15}$/.test(e164)) return null
  return e164.startsWith('+34') ? e164.slice(3) : e164
}

/**
 * Las cadenas que, pasadas por `computeTelefonoLookupHash` (que se queda con los dígitos), dan
 * TODOS los hashes con los que ese número puede estar ya en `clientes`/`cliente_telefonos`:
 *   · español: `600123456` (lo normal), `34600123456` y `0034600123456` (volcados antiguos);
 *   · extranjero: `447700900123` y `00447700900123`.
 * La primera es la canónica (la de `telefonoParaFicha`). Sin duplicados.
 */
export function formasHashTelefono(e164: string | null | undefined): string[] {
  const ficha = telefonoParaFicha(e164)
  if (ficha === null) return []
  const digitos = e164!.slice(1)
  const formas = e164!.startsWith('+34') ? [ficha, digitos, `00${digitos}`] : [digitos, `00${digitos}`]
  return [...new Set(formas)]
}
