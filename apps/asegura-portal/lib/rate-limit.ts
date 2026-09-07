// lib/rate-limit.ts — limitador de peticiones EN MEMORIA, por proceso.
//
// Copia del de `apps/plataforma/lib/rate-limit.ts` (que a su vez es copia del
// de `apps/ialimp/lib/propietario-auth.ts`): las apps no se cruzan. Es
// «best-effort» a propósito — en Vercel cada instancia serverless tiene su
// propio mapa — pero sirve para frenar un bucle antes de que genere un código
// por intento contra `POST /api/acceso/solicitar`.

const intentos = new Map<string, { count: number; resetAt: number }>()

/** IP del cliente tal y como la pone el proxy de Vercel; `'unknown'` si no viene. */
export function getIp(req: Request): string {
  const fwd = req.headers.get('x-forwarded-for')
  return (fwd?.split(',')[0] || 'unknown').trim()
}

/**
 * `true` mientras `key` no pase de `max` intentos en `windowMs`. La ventana es
 * fija (arranca en el primer intento y se reinicia al expirar), no deslizante.
 */
export function rateLimit(
  key: string,
  max = 5,
  windowMs = 15 * 60 * 1000,
  ahora = Date.now(),
): { allowed: boolean; retryAfter?: number } {
  const entrada = intentos.get(key)
  if (!entrada || ahora > entrada.resetAt) {
    intentos.set(key, { count: 1, resetAt: ahora + windowMs })
    return { allowed: true }
  }
  if (entrada.count >= max) {
    return { allowed: false, retryAfter: Math.ceil((entrada.resetAt - ahora) / 1000) }
  }
  entrada.count++
  return { allowed: true }
}
