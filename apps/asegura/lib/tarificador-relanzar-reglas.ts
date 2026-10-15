// Reglas PURAS de «relanzar» un trabajo del tarificador RPA por el puerto de operador (15/10/2026). Sin BD ni red.
// Relanzar = el MISMO trabajo (mismo riesgo, que sigue en la fila) vuelve a `pendiente`. Pensado para que una sesión de
// Claude itere arreglo→prueba sin la pantalla de Alberto. Solo TARIFICAR: emisión y exploración nunca se relanzan por aquí.

/** Estados desde los que se puede relanzar. `error_definitivo` NO: su riesgo ya está purgado (usa «probar» o la oportunidad). */
export const ESTADOS_RELANZABLES = ['atascado'] as const
// `requiere_humano` NO: es captcha/OTP/verificación y cada relanzamiento vuelve a disparar el SMS/aviso a Alberto.

/** Tope de relanzamientos por compañía en una ventana de 24 h. */
export const MAX_RELANZAMIENTOS_24H = 6

export type EntradaRelanzar = {
  estado: string
  modo: string | null
  /** `error.tipo` del trabajo (un abortado por el guard de emisión no se relanza, como en la bandeja). */
  tipoError?: string | null
  /** Otros trabajos de la misma compañía vivos (pendiente, en_curso, error_reintentable, autorizado_emision), sin contar este. */
  vivosCompania: number
  relanzamientos24h: number
  pausada: boolean
}

export type DecisionRelanzar = { ok: true } | { ok: false; status: 409 | 429; motivo: string }

export function decidirRelanzar(e: EntradaRelanzar): DecisionRelanzar {
  if ((e.modo ?? 'tarificar') !== 'tarificar') return { ok: false, status: 409, motivo: `un trabajo de ${e.modo} no se relanza por aquí (solo tarificar)` }
  if (e.tipoError === 'emision') return { ok: false, status: 409, motivo: 'un trabajo abortado por el guard de emisión no se relanza' }
  if (!(ESTADOS_RELANZABLES as readonly string[]).includes(e.estado)) {
    return { ok: false, status: 409, motivo: `el trabajo está ${e.estado}: solo se relanza desde ${ESTADOS_RELANZABLES.join(' o ')}` }
  }
  if (e.pausada) return { ok: false, status: 409, motivo: 'la compañía está en pausa por fallos seguidos del bot: reanúdala antes de relanzar' }
  if (e.vivosCompania > 0) return { ok: false, status: 409, motivo: 'ya hay un trabajo vivo de esa compañía (una ejecución por compañía): espera a que termine' }
  if (e.relanzamientos24h >= MAX_RELANZAMIENTOS_24H) {
    return { ok: false, status: 429, motivo: `tope alcanzado: ${MAX_RELANZAMIENTOS_24H} relanzamientos por compañía cada 24 h (llevas ${e.relanzamientos24h})` }
  }
  return { ok: true }
}
