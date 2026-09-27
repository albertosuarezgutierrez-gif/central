// La baja de un email de recaptación (LSSI art. 21: todo envío comercial
// automatizado necesita una baja de un clic). El token es el propio
// `recaptacion_envios.id`, generado en el CLIENTE antes de mandar el correo
// (ver `enviarLoteEmail` en `cartera-recaptacion.ts`) precisamente para poder
// embeber la URL de baja DENTRO del cuerpo del mismo correo que la crea.
//
// Lógica PURA aquí (validación de forma, construcción de URL); la resolución
// del token contra la BD vive en `cartera-recaptacion-baja.ts`.

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** `true` solo si `t` tiene FORMA de uuid — no dice si existe en la BD. */
export function esTokenBajaValido(t: string | null | undefined): t is string {
  return typeof t === 'string' && UUID_RE.test(t.trim())
}

export function urlBaja(base: string, envioId: string): string {
  return `${base.replace(/\/$/, '')}/api/publico/recaptacion/baja?t=${envioId}`
}

/**
 * URL pública en la que sirve ESTA app, para construir enlaces que van dentro
 * de un correo (la baja, hoy; cualquier otro enlace propio mañana). No hay
 * env dedicada: se deriva de la que ya pone Vercel automáticamente en
 * producción y preview (`VERCEL_PROJECT_PRODUCTION_URL`/`VERCEL_URL`, sin
 * protocolo), con el mismo fallback que usa `plataforma` para apuntar aquí
 * (`ASEGURA_URL` en `apps/plataforma/lib/recaptacion-asegura.ts`).
 */
export function urlPublicaAsegura(env: Partial<Record<string, string | undefined>> = process.env): string {
  const host = env.VERCEL_PROJECT_PRODUCTION_URL?.trim() || env.VERCEL_URL?.trim()
  if (host) return `https://${host}`
  return 'https://central-asegura.vercel.app'
}
