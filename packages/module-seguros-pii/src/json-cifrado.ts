// Un OBJETO entero cifrado en un solo sobre `v1:` (03/10/2026).
//
// Para los datos personales de TERCEROS del parte de siniestro del portal
// (`datos_ramo_cifrado`): listas de contrarios, heridos y afectados. Usa la
// MISMA primitiva y la MISMA clave que el resto de PII de la correduría
// (`encryptField`/`decryptField`, `PII_ENCRYPTION_KEY`): no hay criptografía
// ni clave nuevas.
//
// 🚨 La diferencia con `encryptField` es que aquí NO hay modo «sin clave»:
// `encryptField` sin `PII_ENCRYPTION_KEY` fuera de producción devuelve el
// texto EN CLARO (lo heredó del repo asegura, y su contrato de sincronía no se
// toca). Para una columna que existe solo para no guardar esto en claro, ese
// modo es exactamente el fallo a evitar: estas funciones LANZAN si no hay
// clave, y `cifrarJsonEstricto` comprueba que lo que sale es un sobre `v1:`.
// La BD lo vuelve a exigir con un CHECK (`LIKE 'v1:%'`).
import { decryptField, encryptField } from './field-encryption.ts'

const PREFIJO = 'v1:'

function exigirClave(): void {
  if (!process.env.PII_ENCRYPTION_KEY?.trim()) {
    throw new Error('PII_ENCRYPTION_KEY no configurada: no se cifra ni se descifra sin clave')
  }
}

/** Objeto → sobre `v1:iv:ct:tag`. Lanza sin clave; nunca devuelve texto en claro. */
export function cifrarJsonEstricto(valor: unknown): string {
  exigirClave()
  const sobre = encryptField(JSON.stringify(valor))
  if (!sobre.startsWith(PREFIJO)) throw new Error('cifrarJsonEstricto: la salida no es un sobre cifrado')
  return sobre
}

/**
 * Sobre `v1:` → objeto. Lanza sin clave, con un texto que NO es un sobre (un
 * JSON en claro colado en la columna no se da por bueno), con clave distinta
 * (GCM falla la etiqueta) o si lo descifrado no es JSON.
 */
export function descifrarJsonEstricto(sobre: string): unknown {
  exigirClave()
  if (!sobre.startsWith(PREFIJO)) throw new Error('descifrarJsonEstricto: no es un sobre cifrado')
  return JSON.parse(decryptField(sobre))
}
