// Sesiones por DISPOSITIVO (19/09/2026). Hasta hoy `cuentas.session_jti` guardaba UN solo jti y
// cada login lo pisaba: entrar desde el PC (o Claude en Chrome) expulsaba al móvil, y al revés.
// Ahora `session_jtis` es una lista acotada: cada login añade el suyo, cada logout quita SOLO el
// suyo, y cerrar todas las sesiones sigue siendo posible (vaciar la lista).
/** Dispositivos con sesión viva a la vez. Al entrar el sexto se cae el más antiguo. */
export const MAX_SESIONES = 5

/** Puro: la lista tras añadir `jti` (dedupe + recorte por antigüedad, el nuevo al final). */
export function anadirJti(actuales: readonly string[], jti: string, max = MAX_SESIONES): string[] {
  const sin = actuales.filter(j => j !== jti)
  return [...sin, jti].slice(-max)
}

/** Puro: la lista sin `jti`. */
export function quitarJti(actuales: readonly string[], jti: string): string[] {
  return actuales.filter(j => j !== jti)
}
