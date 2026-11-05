// Secretos de servicio del puerto y del operador. `requireSecret()` (sin fallback a literal: regla del monorepo) y comparación en
// tiempo constante (`secretoCoincide`). Fail-CLOSED: variable ausente o vacía ⇒ nadie autorizado (401), nunca «pasa cualquiera».
import { requireSecret, secretoCoincide } from '@central/core-identity'

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

/** Verticales que pueden mandar hechos. Cada una con SU secreto (`CONTABILIDAD_HECHOS_SECRET_<APP>`): uno filtrado no abre las demás. */
export const APPS_ORIGEN = ['taller', 'ia-rest', 'ialimp', 'sivra', 'rrhh', 'alquiler', 'transporte', 'almacen', 'mariscos'] as const
export type AppOrigen = (typeof APPS_ORIGEN)[number]

export const esAppOrigen = (v: unknown): v is AppOrigen => typeof v === 'string' && (APPS_ORIGEN as readonly string[]).includes(v)

export const envSecretoHechos = (app: AppOrigen) => `CONTABILIDAD_HECHOS_SECRET_${app.toUpperCase().replace(/-/g, '_')}`

export const ENV_OPERADOR = 'CONTABILIDAD_OPERADOR_SECRET'
