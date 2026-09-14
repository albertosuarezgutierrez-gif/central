/**
 * Puerto ESTRECHO del portal del cliente (`apps/asegura-portal` → asegura).
 *
 * 🚨 Es un secreto DISTINTO de `ASEGURA_OPERADOR_SECRET` y no es una
 * duplicación: el de operador abre la cartera entera (leer cualquier ficha, dar
 * de alta, descartar) y lo tiene plataforma, que es la pantalla de Alberto. El
 * portal es una app pública en internet a la que entra cualquiera con un código
 * a su correo; darle ese mismo secreto sería poner la cartera de 32.600 fichas
 * detrás de la app menos protegida del grupo.
 *
 * Lo que hay detrás de ESTE secreto es escribir Y LEER los datos de contacto
 * (dirección, teléfono, correo) de la ficha vinculada a una identidad —desde
 * el 09/09/2026 también `GET`, no solo `POST`— y ni siquiera admite decir en
 * qué ficha: eso lo resuelve asegura por `portal_vinculo`. Con el secreto
 * filtrado, el daño ya NO es solo de integridad (cambiarle la calle a alguien):
 * es también de CONFIDENCIALIDAD, porque quien lo tenga puede leer el
 * teléfono, el correo y la dirección de cualquier identidad vinculada dando
 * su `identidadId`. Sigue acotado a esa única identidad por vez y queda
 * escrito en el historial cuando escribe, pero ya no es «acotado y auditable»
 * a secas: una lectura no deja rastro en `historial_interno`.
 *
 * Cerrado por defecto: sin `ASEGURA_PORTAL_PUENTE_SECRET` no se autoriza a
 * nadie, tampoco en desarrollo. Un fallback a un literal sería una credencial
 * usable publicada en el repo (regla de secretos del CLAUDE.md raíz).
 */
export function puentePortalAutorizado(req: Request): boolean {
  const secret = process.env.ASEGURA_PORTAL_PUENTE_SECRET
  if (!secret) return false
  return (req.headers.get('authorization') || '') === `Bearer ${secret}`
}
