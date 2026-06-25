// requireSecret — lee un secreto de entorno con guarda de producción.
//
// Sustituye el idiom peligroso `process.env.X || 'literal'` (el literal queda en el
// repo y, para secretos que firman/validan tokens, es una credencial usable). Aquí:
//   · si la env está → la devuelve.
//   · si falta y NODE_ENV==='production' → lanza (no se arranca con un secreto vacío
//     ni con un literal conocido).
//   · si falta en desarrollo → devuelve `devFallback` (si se da), o lanza.
// El guardián `test/regression-secrets.test.ts` exige usar esto (o la guarda
// multilínea equivalente) en vez de un literal hardcodeado.
export function requireSecret(name: string, devFallback?: string): string {
  const v = process.env[name]
  if (v) return v
  if (process.env.NODE_ENV === 'production')
    throw new Error(`${name} no configurado en producción`)
  if (devFallback !== undefined) return devFallback
  throw new Error(`${name} no configurado (sin fallback de desarrollo)`)
}
