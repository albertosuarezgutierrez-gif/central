// Comparación de secretos de servicio (CRON_SECRET, tokens de operador, claves de ingesta).
//
// 🔒 Dos propiedades que `===` no tiene:
//   · TIEMPO CONSTANTE respecto al secreto: el bucle recorre la longitud de lo RECIBIDO (la fija
//     quien llama) y acumula diferencias con XOR; el secreto se lee con `i % esperado.length`, así
//     que ni el prefijo acertado ni la longitud del secreto se filtran por el tiempo de respuesta.
//   · FAIL-CLOSED: esperado ausente o vacío ⇒ false. Nunca `Bearer undefined`, nunca «sin secreto
//     configurado, pasa cualquiera» (`undefined !== undefined` es false y autorizaba).
//
// JS puro a propósito (sin `node:crypto`): este paquete promete valer en edge/middleware y el
// guardián `test/regression-secretos-tiempo-constante.test.ts` impide arrastrar `node:crypto` aquí.

/** true solo si `esperado` existe, no está vacío y `recibido` es EXACTAMENTE igual. */
export function secretoCoincide(
  recibido: string | null | undefined,
  esperado: string | null | undefined,
): boolean {
  if (typeof recibido !== 'string' || typeof esperado !== 'string') return false
  if (!esperado || !recibido) return false
  let dif = recibido.length ^ esperado.length
  for (let i = 0; i < recibido.length; i++) {
    dif |= recibido.charCodeAt(i) ^ esperado.charCodeAt(i % esperado.length)
  }
  return dif === 0
}

type ConCabeceras = { headers: { get(nombre: string): string | null } }

/**
 * true solo si la cabecera `Authorization` es `Bearer <valor de process.env[nombreEnv]>`.
 * Acepta una Request/NextRequest, unos Headers o el valor de la cabecera ya extraído.
 * Variable de entorno ausente o vacía ⇒ false. `env` es inyectable para los tests.
 */
export function autorizacionBearerValida(
  fuente: ConCabeceras | { get(nombre: string): string | null } | string | null | undefined,
  nombreEnv: string,
  env: Record<string, string | undefined> = process.env,
): boolean {
  const esperado = env[nombreEnv]
  if (!esperado) return false
  let cabecera: string | null | undefined
  if (typeof fuente === 'string' || fuente == null) cabecera = fuente
  else if ('headers' in fuente) cabecera = fuente.headers.get('authorization')
  else cabecera = fuente.get('authorization')
  if (typeof cabecera !== 'string') return false
  const m = /^Bearer\s+(.+)$/i.exec(cabecera)
  return m ? secretoCoincide(m[1], esperado) : false
}
