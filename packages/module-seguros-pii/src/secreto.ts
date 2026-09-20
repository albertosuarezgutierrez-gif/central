// Comparación de secretos de servicio en TIEMPO CONSTANTE.
//
// Por qué existe: los puertos servidor→servidor de la correduría (operador,
// puente del portal, crons) comparaban su Bearer con `===`. `===` sobre strings
// corta en el primer carácter distinto, así que el tiempo de respuesta filtra
// cuánto prefijo has acertado y un secreto se puede reconstruir byte a byte.
// Sobre HTTPS y con el ruido de la red el ataque es caro, pero el puerto de
// operador abre la cartera entera: no es el sitio donde ahorrar cuatro líneas.
//
// El patrón NO es nuevo en este repo: `apps/asegura/lib/codeoscopic/webhook.ts`
// ya autenticaba así el webhook de Codeoscopic. Lo que faltaba era tenerlo en
// UN solo sitio; cuatro copias son cuatro sitios donde volver a escribir `===`.
//
// 🚨 Vive en este paquete —y no en `@central/core-identity`— porque usa
// `node:crypto` y core-identity promete a sus nueve apps ser válido también en
// EDGE (su `crypto.ts` lo dice: Web Crypto, sin `node:*`). Meter `node:crypto`
// en su barril rompería el primer `middleware.ts` que lo importase, con
// `UnhandledSchemeError` en el build de producción y typecheck en verde. Este
// paquete ya es node-only (AES-GCM y HMAC de PII) y lo comparten las dos apps
// de la correduría, que es exactamente lo que hacía falta.
import { createHash, timingSafeEqual } from 'node:crypto'

/** SHA-256 del valor: iguala la longitud SIEMPRE, así la comparación tampoco
 *  filtra cuántos caracteres mide el secreto. */
const digest = (s: string) => createHash('sha256').update(s, 'utf8').digest()

/**
 * `true` solo si las dos cadenas son idénticas, en tiempo constante.
 *
 * Fail-closed: un valor vacío, `null` o `undefined` NUNCA autoriza — ni en
 * desarrollo. Es la misma regla que ya aplican los cuatro llamadores («sin
 * secreto configurado no se autoriza a nadie»), aquí como último cerrojo.
 */
export function secretosIguales(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false
  return timingSafeEqual(digest(a), digest(b))
}

/**
 * `true` si la cabecera `Authorization` es exactamente `Bearer <secreto>`.
 *
 * Compara la cabecera ENTERA contra `Bearer ${secreto}` —no parsea el esquema—
 * para no cambiar el contrato de los puertos que ya lo hacían así: `basic x`,
 * `bearer  x` (dos espacios) o un `Bearer` en minúscula siguen sin autorizar.
 */
export function bearerAutorizado(cabecera: string | null | undefined, secreto: string | null | undefined): boolean {
  if (!secreto) return false
  return secretosIguales(cabecera ?? '', `Bearer ${secreto}`)
}
