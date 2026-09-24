// Decisión pura del puente legacy de Smoobu (ver el comentario 🌉 en `lib/smoobu.ts`).
//
// GET /api/rates da 401 con HMAC (ticket Smoobu #1864141, sin resolver) pero el esquema legacy
// (header `Api-Key` plano) sigue funcionando hasta su sunset del 25/09/2026 — confirmado a mano
// el 15/09/2026 (legacy 200, HMAC 401, mismo endpoint, misma propiedad). Extraído a módulo puro
// para poder testearlo: `smoobu.ts` importa `@/lib/db`, así que no es testeable con `node --test`.

/**
 * ¿Esta petición debe ir por el puente legacy en vez de HMAC?
 *
 * Solo GET a /api/rates, y solo si hay key legacy puesta (fail-safe: sin
 * `SMOOBU_LEGACY_API_KEY`, todo sigue por HMAC como siempre).
 */
export function debeUsarPuenteLegacy(
  method: string,
  url: string,
  legacyKeyPresente: boolean,
): boolean {
  if (!legacyKeyPresente) return false
  if (method.toUpperCase() !== 'GET') return false
  let pathname: string
  try {
    pathname = new URL(url).pathname
  } catch {
    return false
  }
  return pathname === '/api/rates'
}
