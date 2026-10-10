// lib/rate-limit.ts — limitador EN MEMORIA, por proceso (copia del de asegura-portal/plataforma:
// las apps no se importan entre sí).
//
// 🚨 Es «best-effort»: en Vercel cada instancia serverless tiene su propio mapa. Frena al bot
// torpe que machaca desde una IP antes de tocar la BD; el límite REAL del acceso por email es
// el que cuenta filas en `rrhh.acceso_otps` (por email y por IP), que ven todas las instancias.

const intentos = new Map<string, { count: number; resetAt: number }>()

/** IP del cliente tal y como la pone el proxy de Vercel; `'unknown'` si no viene. */
export function getIp(req: Request): string {
  const fwd = req.headers.get('x-forwarded-for')
  return (fwd?.split(',')[0] || 'unknown').trim()
}

/** `allowed` mientras `key` no pase de `max` intentos en `windowMs` (ventana fija). */
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
  if (entrada.count >= max) return { allowed: false, retryAfter: Math.ceil((entrada.resetAt - ahora) / 1000) }
  entrada.count++
  return { allowed: true }
}

/** Solo tests: vacía el mapa. */
export function _resetRateLimit() { intentos.clear() }
