// Cifrado de las contraseñas del servicio web de SES.HOSPEDAJES.
//
// AES-256-GCM, no CBC ni ECB: GCM viene con autenticación integrada, así que un
// texto cifrado manipulado falla al descifrar en vez de devolver basura que
// luego mandaríamos al Ministerio como si fuera una contraseña.
//
// Formato guardado: `v1.<iv-b64>.<tag-b64>.<cifrado-b64>`. El prefijo de versión
// no es decorativo: el día que haya que rotar el algoritmo, permite distinguir lo
// viejo de lo nuevo sin adivinar por la longitud.
//
// 🚨 La clave NO tiene literal de respaldo: falta `SES_CRYPTO_KEY` → revienta. Es
// deliberado. Un fallback en el repositorio es una credencial publicada, y esta clave
// protege documentos de identidad de personas. Lo vigila `test/regression-secrets.test.ts`.
//
// Se lee `process.env` a mano en vez de con `requireSecret` de `@central/core-identity`
// **a propósito**: ese paquete usa imports internos sin extensión, que Node no resuelve
// bajo `node --test` (el runner de esta app), así que importarlo aquí dejaría este módulo
// sin tests. La semántica es la misma —sin valor, excepción— y el guardián de secretos
// solo prohíbe el literal de respaldo, que aquí no existe.
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto'

const VERSION = 'v1'

/**
 * La clave viaja en base64 y debe medir 32 bytes. Falla EXPLÍCITO si no los mide,
 * nombrando lo que ha llegado: una clave mal pegada en Vercel produce si no un
 * "Invalid key length" opaco en mitad de un cron, a las 7 de la mañana.
 */
function clave(): Buffer {
  const b64 = process.env.SES_CRYPTO_KEY
  if (!b64) {
    throw new Error(
      'Falta SES_CRYPTO_KEY: sin ella no se pueden leer ni guardar las contraseñas de SES. ' +
      'Genérala con: openssl rand -base64 32',
    )
  }
  const key = Buffer.from(b64, 'base64')
  if (key.length !== 32) {
    throw new Error(
      `SES_CRYPTO_KEY debe ser 32 bytes en base64 para AES-256 (mide ${key.length}). ` +
      `Genérala con: openssl rand -base64 32`,
    )
  }
  return key
}

export function cifrarPassword(plano: string): string {
  if (!plano) throw new Error('No se cifra una contraseña vacía')
  const iv = randomBytes(12) // 96 bits, el tamaño que recomienda GCM
  const c = createCipheriv('aes-256-gcm', clave(), iv)
  const cifrado = Buffer.concat([c.update(Buffer.from(plano, 'utf8')), c.final()])
  return [
    VERSION,
    iv.toString('base64'),
    c.getAuthTag().toString('base64'),
    cifrado.toString('base64'),
  ].join('.')
}

export function descifrarPassword(guardado: string): string {
  const partes = (guardado ?? '').split('.')
  if (partes.length !== 4 || partes[0] !== VERSION) {
    throw new Error(`Contraseña cifrada con formato desconocido (esperado ${VERSION}.iv.tag.datos)`)
  }
  const [, ivB64, tagB64, datosB64] = partes
  const d = createDecipheriv('aes-256-gcm', clave(), Buffer.from(ivB64, 'base64'))
  d.setAuthTag(Buffer.from(tagB64, 'base64'))
  return Buffer.concat([d.update(Buffer.from(datosB64, 'base64')), d.final()]).toString('utf8')
}
