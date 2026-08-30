// lib/sivra/prevision-logica.ts — lógica PURA de la previsión de rendimiento por piso (sin BD).
//
// Decisión de Alberto (30/08/2026): la previsión enseña SIEMPRE por separado lo CONFIRMADO
// (reservas reales ya en el calendario) y lo ESTIMADO (lo que aún podría venderse), y se guarda
// una foto diaria para poder contrastar después si se cumplió (previsión de tesorería).
//
// Reglas de la casa que gobiernan este módulo:
// · «Sin base histórica» = null, nunca un 0 — un estimado 0 se leería como «no vas a vender más».
// · Una base de 0€ el año pasado NO sirve de base: puede ser un piso que no operaba. Estimar 0
//   desde ahí es afirmar con un dato que no dice eso.
// · El pace del año pasado con reservas sin `reserved_at` se DECLARA: excluirlas en silencio
//   infravalora la base y el ritmo de hoy parecería mejor de lo que es.

/** Estimado adicional del mes: lo que faltaría por vender para repetir el mismo mes del año
 *  anterior. null = sin base con la que estimar (jamás 0 por defecto). */
export function estimadoAdicional(confirmado: number, baseAnterior: number | null): number | null {
  if (baseAnterior == null || baseAnterior <= 0) return null
  return Math.max(0, Math.round((baseAnterior - confirmado) * 100) / 100)
}

/** Media simple de los gastos de los últimos meses CERRADOS. null si no hay ninguno. */
export function mediaGastos(gastosMeses: number[]): number | null {
  if (gastosMeses.length === 0) return null
  const s = gastosMeses.reduce((a, b) => a + b, 0)
  return Math.round((s / gastosMeses.length) * 100) / 100
}

/** Días que faltan (naturales) desde `hoy` hasta el día 1 del mes 'YYYY-MM'. Negativo = ya empezó. */
export function diasHastaMes(mes: string, hoy: Date): number {
  const [y, m] = mes.split('-').map(Number)
  const inicio = Date.UTC(y, m - 1, 1)
  const hoyUtc = Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth(), hoy.getUTCDate())
  return Math.round((inicio - hoyUtc) / 86_400_000)
}

export interface Pace {
  /** Lo confirmado que había el año pasado a esta misma altura para su mes equivalente.
   *  null = no se puede medir (todas sus reservas sin `reserved_at`). */
  anteriorMismaAltura: number | null
  /** Ingreso de reservas del mes equivalente del año pasado SIN fecha de reserva conocida:
   *  no se sabe si a esta altura ya estaban. Si pesa, el pace se degrada a null. */
  sinFechaReserva: number
  /** Δ% de lo confirmado hoy contra esa base. null = base no medible. */
  deltaPct: number | null
}

/**
 * Ritmo de reservas: confirmado HOY vs lo que había a la misma altura el año pasado.
 * Si más del 25% del ingreso del mes equivalente no tiene `reserved_at`, la base no es fiable
 * y el pace se declara como no medible (mejor un «no se sabe» que un % engañosamente bueno).
 */
export function pace(args: {
  confirmadoHoy: number
  anteriorMismaAltura: number
  totalAnterior: number
  sinFechaReserva: number
}): Pace {
  const { confirmadoHoy, anteriorMismaAltura, totalAnterior, sinFechaReserva } = args
  const noFiable = totalAnterior > 0 && sinFechaReserva / totalAnterior > 0.25
  if (noFiable || anteriorMismaAltura <= 0) {
    return { anteriorMismaAltura: noFiable ? null : anteriorMismaAltura, sinFechaReserva, deltaPct: null }
  }
  return {
    anteriorMismaAltura,
    sinFechaReserva,
    deltaPct: Math.round(((confirmadoHoy - anteriorMismaAltura) / anteriorMismaAltura) * 100),
  }
}

/** Desvío % de lo real contra lo previsto. null si el previsto no existía o era 0. */
export function desvioPrevision(previsto: number | null, real: number): number | null {
  if (previsto == null || previsto <= 0) return null
  return Math.round(((real - previsto) / previsto) * 100)
}

export interface AlertaPace {
  avisar: boolean
  motivo: string | null
}

/** Umbral heurístico v1 (documentado en el spec): a ~30 días del mes, si lo confirmado no llega
 *  al 40% de lo que ese mes hizo el año pasado (y aquel mes fue relevante), se avisa UNA vez. */
export const ALERTA_PACE_UMBRAL = 0.4
export const ALERTA_PACE_MIN_BASE = 500
const ALERTA_PACE_VENTANA: [number, number] = [28, 32]

/**
 * Decide si toca avisar de previsión floja para un mes. Ventana 28-32 días antes de su inicio
 * (el cron es diario: puede saltarse un día). El dedupe por (mes, piso) lo pone el caller en BD.
 * Sin base del año anterior NO se avisa: no hay contra qué medir «flojo».
 */
export function decidirAlertaPace(args: {
  diasHastaInicio: number
  confirmado: number
  totalAnterior: number | null
}): AlertaPace {
  const { diasHastaInicio, confirmado, totalAnterior } = args
  if (diasHastaInicio < ALERTA_PACE_VENTANA[0] || diasHastaInicio > ALERTA_PACE_VENTANA[1]) {
    return { avisar: false, motivo: null }
  }
  if (totalAnterior == null || totalAnterior < ALERTA_PACE_MIN_BASE) {
    return { avisar: false, motivo: null }
  }
  if (confirmado >= totalAnterior * ALERTA_PACE_UMBRAL) return { avisar: false, motivo: null }
  return {
    avisar: true,
    motivo: `confirmado ${Math.round((confirmado / totalAnterior) * 100)}% del mismo mes del año pasado`,
  }
}
