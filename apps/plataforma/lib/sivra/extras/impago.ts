// lib/sivra/extras/impago.ts — qué hacer con un extra cuyo enlace se mandó y nadie ha pagado.
//
// Decisión PURA y testeable. La regla la puso Alberto: un recordatorio suave a las 24 h y, si 48 h
// antes de la entrada sigue sin pagar, se caduca y se le avisa a él. Sin pago no se monta nada:
// la cuna no sale del trastero por un enlace abierto.

export const HORAS_RECORDATORIO = 24
export const HORAS_ANTES_ENTRADA_CADUCA = 48

export type AccionImpago = 'esperar' | 'recordar' | 'caducar'

/**
 * `horasHastaEntrada` a `null` significa «no se sabe cuándo entra» (no se pudo leer la reserva).
 * En ese caso NUNCA se caduca: cancelar un cobro vivo porque no hemos podido mirar la fecha es
 * exactamente el error de tratar un «no lo sé» como un dato.
 */
export function decidirImpago(p: {
  horasDesdeEnlace: number
  yaRecordado: boolean
  horasHastaEntrada: number | null
}): AccionImpago {
  if (p.horasHastaEntrada !== null && p.horasHastaEntrada <= HORAS_ANTES_ENTRADA_CADUCA) return 'caducar'
  if (!p.yaRecordado && p.horasDesdeEnlace >= HORAS_RECORDATORIO) return 'recordar'
  return 'esperar'
}

/** Horas entre dos instantes; null si alguna fecha no es legible. */
export function horasEntre(desde: Date | null | undefined, hasta: Date | null | undefined): number | null {
  if (!desde || !hasta) return null
  const a = desde.getTime(), b = hasta.getTime()
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null
  return (b - a) / 3_600_000
}
