// Retenciones de IRPF de las comisiones de la correduría: REALES (de las liquidaciones del libro
// `comisiones_devengo`, CIMA o PDF) cuando existen; si no, ESTIMADAS al 15 % sobre lo cobrado.
// PURO: `node --test lib/correduria/retenciones-reales.test.ts`.
//
// 🚨 Antes `lib/finanzas.ts` estimaba TODA la retención como cobrado × 15/85, aunque el libro ya
// tenía la retención exacta de muchos periodos. Aquí se separan: la parte del cobrado que casa con
// una liquidación (abono a abono, `banco_movimiento_ids`) aporta su retención REAL; el resto del
// cobrado sigue estimándose, y se DICE que es estimación. A la renta va el bruto = cobrado + retención
// (no restar el 15 % dos veces: ver `cuadre.ts`).

import { eur } from '../dinero.ts'

export const RETENCION_COMISIONES = 0.15

export interface PeriodoConRetencion {
  /** Retención de la liquidación del periodo. */
  retencion: number
  /** Total de abonos del periodo (todos). */
  bancoTotal: number
  /** De esos abonos, lo que cae dentro del rango de fechas que se está mirando. */
  bancoEnRango: number
}

export type FuenteRetencion = 'real' | 'mixta' | 'estimada'

export interface RetencionesCorreduria {
  total: number
  /** Parte real (de liquidaciones). `null` = no se pudo leer el libro: todo es estimación. */
  real: number | null
  /** Parte estimada al 15 % sobre el cobrado que no casa con ninguna liquidación. */
  estimada: number
  /** Cobrado (neto) cuyo origen es una liquidación con retención conocida. */
  cobradoCubierto: number
  fuente: FuenteRetencion
}

const r2 = (n: number) => Math.round(n * 100) / 100

/**
 * @param cobradoGravable cobrado neto de la correduría en el rango (sin prestaciones exentas).
 * @param periodos liquidaciones con retención conocida y abono casado; `null` = lectura fallida.
 */
export function retencionesCorreduria(cobradoGravable: number, periodos: readonly PeriodoConRetencion[] | null): RetencionesCorreduria {
  const factor = RETENCION_COMISIONES / (1 - RETENCION_COMISIONES)
  if (periodos == null) {
    const estimada = r2(Math.max(0, cobradoGravable) * factor)
    return { total: estimada, real: null, estimada, cobradoCubierto: 0, fuente: 'estimada' }
  }
  let real = 0
  let cubierto = 0
  for (const p of periodos) {
    if (!(p.bancoTotal > 0) || !(p.bancoEnRango > 0)) continue
    const fraccion = Math.min(1, p.bancoEnRango / p.bancoTotal)
    real += p.retencion * fraccion
    cubierto += p.bancoEnRango
  }
  // Lo cubierto nunca puede pasar de lo cobrado (el rango de `finanzas.ts` puede excluir abonos
  // exentos o ignorados que el libro sí casó).
  cubierto = Math.min(cubierto, Math.max(0, cobradoGravable))
  const resto = Math.max(0, cobradoGravable - cubierto)
  const estimada = r2(resto * factor)
  real = r2(real)
  const fuente: FuenteRetencion = cubierto === 0 ? 'estimada' : resto < 0.01 ? 'real' : 'mixta'
  return { total: r2(real + estimada), real, estimada, cobradoCubierto: r2(cubierto), fuente }
}

/**
 * Cómo se rotula en pantalla. La parte estimada SIEMPRE lleva «estimada 15 %»: es la que no sale de
 * ninguna liquidación. `r` ausente (respuesta vieja de la API) = todo estimado.
 */
export function rotuloRetenciones(r: RetencionesCorreduria | null | undefined, total: number): string {
  if (!r || r.fuente === 'estimada') {
    return `${eur(total)} (estimada 15 %${r && r.real == null ? ': no se pudo leer el libro de comisiones' : ', sin liquidaciones'})`
  }
  if (r.fuente === 'real') return `${eur(r.total)} (real, de las liquidaciones)`
  return `${eur(r.total)} = ${eur(r.real as number)} real (liquidaciones) + ${eur(r.estimada)} estimada 15 %`
}
