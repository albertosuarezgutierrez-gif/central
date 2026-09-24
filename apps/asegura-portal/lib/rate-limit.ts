// lib/rate-limit.ts — limitador EN MEMORIA, por proceso.
//
// Copia del de `apps/plataforma/lib/rate-limit.ts` (las apps no se importan
// entre sí). Es «best-effort» a propósito: en Vercel cada instancia serverless
// tiene su propio mapa y se recicla, así que el tope real es «≈ max por
// instancia y ventana», no un límite global.
//
// 🚨 Por eso NO basta con este para el amplificador de correo de
// `/api/acceso/solicitar`. Este mapa frena a un bot torpe que machaca desde una
// IP; a un abusador repartido no lo ve, porque cada petición puede caer en otra
// instancia con el contador a cero. El que de verdad impide llenarle el buzón a
// una persona es el tope POR DESTINO, que cuenta filas en `portal_codigo` y por
// tanto es global. Van los dos: este corta el ruido barato antes de tocar la
// BD, y el otro pone el límite real.

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
