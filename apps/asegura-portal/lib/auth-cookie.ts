/**
 * El nombre de la cookie de sesión, en un archivo SIN dependencias a propósito:
 * `middleware.ts` corre en edge y `lib/auth.ts` importa `node:crypto`.
 * `lib/auth.ts` lo re-exporta, así que el resto del portal no cambia.
 */
export const COOKIE_NAME = 'asegura_portal_session'
