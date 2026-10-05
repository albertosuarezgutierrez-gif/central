// Teléfono de WhatsApp → forma canónica E.164 y → las formas con las que la cartera lo hashea
// (05/10/2026, canal WhatsApp entrante de la correduría). PURO: sin libphonenumber, sin red.
//
// Por qué dos funciones y no una:
//   · `aE164` da la identidad del número (`+34600123456`): es la clave de la CONVERSACIÓN.
//   · La cartera NO guarda E.164: `normalizarTelefono` (cliente-edicion.ts) deja los españoles en
//     9 dígitos sin prefijo y los extranjeros con `+`, y el índice ciego
//     (`computeTelefonoLookupHash`) hashea SOLO LOS DÍGITOS. Así que `+34600123456` y `600123456`
//     dan hashes DISTINTOS. Para encontrar la ficha hay que probar todas las formas en que ese
//     número puede estar escrito en la base (`formasHashTelefono`). El hash no se toca.

const SEPARADORES = /[\s.\-()/]/g

/**
 * Teléfono escrito de cualquier manera → `+<prefijo><número>` o `null` si no es un teléfono.
 *
 *   600123456 · 0034600123456 · +34 600 123 456 · 34600123456 → +34600123456
 *   +44 7700 900123 · 0044… · 447700900123 (el `wa_id` de Meta, sin `+`) → +447700900123
 *
 * Reglas (solo se conoce bien España, `paisDefecto` 'ES'):
 *   · Español: 9 dígitos que empiezan por 6-9. Con `+34`/`0034`/`34` delante se acepta; un `+34`
 *     seguido de otra cosa es `null` (no se «arregla» un número español mal escrito).
 *   · Con `+` o `00`: 8-15 dígitos en total y el prefijo no empieza por 0.
 *   · Solo dígitos, sin prefijo: 9 → español (si `paisDefecto` es ES); 10-15 → ya trae prefijo
 *     (así llega el `wa_id` de Meta). Menos de 9, o empezar por 0 sin ser `00`, es `null`.
 */
export function aE164(tel: unknown, paisDefecto: 'ES' | string = 'ES'): string | null {
  if (typeof tel !== 'string' && typeof tel !== 'number') return null
  let s = String(tel).replace(SEPARADORES, '')
  if (s === '') return null
  if (s.startsWith('00')) s = '+' + s.slice(2)
  if (s.startsWith('+')) {
    const d = s.slice(1)
    if (!/^\d+$/.test(d)) return null
    return internacional(d)
  }
  if (!/^\d+$/.test(s)) return null
  if (s.length === 9) {
    if (paisDefecto !== 'ES') return null
    return /^[6-9]/.test(s) ? `+34${s}` : null
  }
  if (s.startsWith('0')) return null
  if (s.length >= 10 && s.length <= 15) return internacional(s)
  return null
}

/** Dígitos que YA incluyen el prefijo de país. */
function internacional(d: string): string | null {
  if (d.length < 8 || d.length > 15 || d.startsWith('0')) return null
  if (d.startsWith('34')) {
    const nacional = d.slice(2)
    return /^[6-9]\d{8}$/.test(nacional) ? `+${d}` : null
  }
  return `+${d}`
}

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
