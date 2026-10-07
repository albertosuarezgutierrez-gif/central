// Aviso de VERIFICACIÓN HUMANA del tarificador (08/10/2026). PURO.
// Cuando un portal pide un código (SMS/OTP) el worker acaba el trabajo como `requiere_humano` con el mensaje
// `requiere_verificacion_humana: <Compañía> pide verificación: entra en su portal, valida y pulsa Reintentar`
// (services/tarificador-rpa/src/errores.ts). El worker no tiene Telegram: plataforma lee la lista de aquí y avisa.
//
// 🚨 Sin datos personales: del trabajo solo salen su id, la compañía y el ramo. Ni riesgo, ni cliente, ni mensaje del portal.
// 🚨 Una sola vez por trabajo: la marca `avisadoHumanoEn` va dentro del jsonb `error` (sin SQL nuevo). Un fallo NUEVO
//    del mismo trabajo (reintento) reescribe `error` sin marca y vuelve a avisar: es otra verificación.

/** El mensaje puede llevar delante una nota entre corchetes del runner (`[nota] requiere_verificacion_humana: …`). */
const PATRON = /^(?:\[[^\]]{0,200}\]\s*)?requiere_verificacion_humana:/

export type FilaVerificacion = { id: string; compania: string; ramo: string; estado: string; error: unknown; terminado_at: Date | string | null }
export type AvisoVerificacion = { trabajoId: string; compania: string; ramo: string; terminadoEn: string | null }

const obj = (v: unknown): Record<string, unknown> | null =>
  typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : null

/** ¿Es un `requiere_humano` por verificación (y no un CAPTCHA u otra causa)? */
export function esVerificacionHumana(estado: string, error: unknown): boolean {
  if (estado !== 'requiere_humano') return false
  const m = obj(error)?.mensaje
  return typeof m === 'string' && PATRON.test(m.trimStart())
}

/** ¿Ya se avisó de ESTE fallo? */
export function yaAvisado(error: unknown): boolean {
  const a = obj(error)?.avisadoHumanoEn
  return typeof a === 'string' && a !== ''
}

/** Filas del trabajo → los avisos que TOCAN (verificación humana, sin marca), sin datos personales. */
export function avisosPendientes(filas: readonly FilaVerificacion[]): AvisoVerificacion[] {
  return filas
    .filter((f) => esVerificacionHumana(f.estado, f.error) && !yaAvisado(f.error))
    .map((f) => ({
      trabajoId: f.id,
      compania: f.compania,
      ramo: f.ramo,
      terminadoEn: f.terminado_at ? new Date(f.terminado_at).toISOString() : null,
    }))
}
