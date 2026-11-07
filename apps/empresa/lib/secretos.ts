// Secretos de «Mi empresa». `requireSecret()` (sin fallback a literal: regla del monorepo) y comparación en tiempo constante.
// Fail-CLOSED: variable ausente o vacía ⇒ nadie autorizado (401/503), nunca «pasa cualquiera».
// Ningún secreto compartido con rrhh, contabilidad ni el portal (spec §8).
import { requireSecret, secretoCoincide } from '@central/core-identity'

export const ENV_SESION = 'HERRAMIENTAS_SESSION_SECRET'
export const ENV_OPERADOR = 'HERRAMIENTAS_OPERADOR_SECRET'

/** Valor del secreto o null si no está configurado (en producción `requireSecret` lanza; aquí se traduce a «no autoriza»). */
export function leerSecreto(nombre: string): string | null {
  try {
    const v = requireSecret(nombre)
    return v ? v : null
  } catch {
    return null
  }
}

/** `Authorization: Bearer <valor de la env>`; false si falta la cabecera, la env o no coinciden. */
export function bearerValido(cabecera: string | null | undefined, nombreEnv: string): boolean {
  if (typeof cabecera !== 'string') return false
  const m = /^Bearer\s+(.+)$/i.exec(cabecera.trim())
  if (!m) return false
  const esperado = leerSecreto(nombreEnv)
  return esperado !== null && secretoCoincide(m[1], esperado)
}
