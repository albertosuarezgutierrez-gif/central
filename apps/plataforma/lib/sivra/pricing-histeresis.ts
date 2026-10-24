// lib/sivra/pricing-histeresis.ts — histéresis POR SENTIDO para el motor de SIVRA.
//
// POR QUÉ (11/10/2026). La banda muerta del 3% de `apply/route.ts` solo compara el objetivo con el
// precio ACTUAL, así que no ve el vaivén: los términos que entran y salen de una pasada a otra
// (ancla de la fecha, premio de mercado, techos de mercado/ADR) mueven el precio arriba y abajo
// un 6-15% en fechas lejanas. Caso fundacional, Busto Reform 15/11/2026, una semana de
// `pricing_applied`: 85→76→82→90→84→81→88→80→88→78; dos pasadas del 08/10 a las 14:15 y 14:17 con
// el MISMO target_crudo (86) y el MISMO rail_ancla (81) escribieron 88→80→88.
//
// QUÉ HACE. Si la última escritura nuestra de esa (piso, fecha) fue en sentido CONTRARIO al nuevo
// movimiento y hace menos de `HORAS_HISTERESIS`, el cambio solo se escribe si supera
// `UMBRAL_HISTERESIS` (en vez del 3% de la banda muerta). Pasado ese plazo, o en el mismo sentido,
// manda la regla de siempre.
//
// Umbral 10% / 48 h, medido el 11/10/2026 sobre 7 días de pricing_applied (fechas a >30 días):
// 275 de 1.172 escrituras fueron reversos dentro de 48 h; <8% retenía 152 (55%), <10% retiene 239
// (87%) y <12% 274 (todas: es casi el raíl entero). 10% es la MITAD del raíl diario (±20%): un
// movimiento de verdad de medio día de raíl sigue pasando a la primera.
//
// NUNCA RETIENE (vuelve a la regla de antes):
//   - fecha cercana (≤ DIAS_VISTA_MIN_HISTERESIS) o con last-minute activo: ahí retener es no vender.
//   - fecha de evento (eventTarget > 0): el salto de evento no es ruido.
//   - precio actual por debajo de min_price (lo que la banda muerta ya obliga a corregir) o por
//     encima de max_price.
//   - bajada hasta min_price (objetivo ≤ min_price).
//   - precio actual FUERA del raíl del día [railLo, railHi]: el raíl obliga a moverlo.
//   - sin historial fiable: lectura caída, escritura sin `old_price`, o el precio vivo ya no es el
//     que escribimos (alguien lo tocó a mano en Smoobu). «No se sabe» ≠ «fue al revés».
//
// Degradación: cualquier duda → `retener: false`, o sea, exactamente el motor de antes.

import type { UltimaEscritura } from "./pricing-descongelar.ts"

export const UMBRAL_HISTERESIS = 0.10
export const HORAS_HISTERESIS = 48
/** Mismo corte de «lejos» que la guarda de outlier del motor (OUTLIER_HORIZON_DAYS). */
export const DIAS_VISTA_MIN_HISTERESIS = 30

export type HisteresisInput = {
  /** precio vivo en Smoobu (null = fecha sin precio) */
  old: number | null
  /** objetivo final de esta pasada, ya acotado */
  target: number
  /** última escritura NO simulada de esa (piso, fecha); null = no consta o lectura caída */
  ultima: UltimaEscritura | null
  diasVista: number
  /** > 0 si la fecha tiene salto de evento */
  eventTarget: number
  lastMinuteActivo: boolean
  minPrice: number | null
  maxPrice: number | null
  railLo: number | null
  railHi: number | null
}

export type HisteresisOpts = { umbral?: number; horas?: number; diasVistaMin?: number }

export type HisteresisResult = { retener: boolean; motivo: string }

const pasa = (motivo: string): HisteresisResult => ({ retener: false, motivo })

export function histeresisSentido(i: HisteresisInput, o: HisteresisOpts = {}): HisteresisResult {
  const umbral = o.umbral ?? UMBRAL_HISTERESIS
  const horasMax = o.horas ?? HORAS_HISTERESIS
  const diasMin = o.diasVistaMin ?? DIAS_VISTA_MIN_HISTERESIS
  const { old, target, ultima: ue } = i

  if (old == null || !(old > 0) || !Number.isFinite(target) || target === old) return pasa("sin_movimiento")
  if (i.diasVista <= diasMin) return pasa("cercana")
  if (i.lastMinuteActivo) return pasa("last_minute")
  if (i.eventTarget > 0) return pasa("evento")
  if (i.minPrice != null && old < i.minPrice) return pasa("bajo_min_price")
  if (i.maxPrice != null && old > i.maxPrice) return pasa("sobre_max_price")
  if (i.minPrice != null && target < old && target <= i.minPrice) return pasa("baja_a_min_price")
  if (i.railLo != null && old < i.railLo) return pasa("fuera_rail")
  if (i.railHi != null && old > i.railHi) return pasa("fuera_rail")

  if (!ue || ue.prev == null || !Number.isFinite(ue.horas) || ue.horas < 0) return pasa("sin_historial")
  if (ue.horas >= horasMax) return pasa("fuera_ventana")
  if (Math.round(ue.ult) !== Math.round(old)) return pasa("precio_tocado_fuera")
  const sentidoPrevio = Math.sign(ue.ult - ue.prev)
  const sentidoNuevo = Math.sign(target - old)
  if (sentidoPrevio === 0 || sentidoPrevio === sentidoNuevo) return pasa("mismo_sentido")

  if (Math.abs(target - old) / old >= umbral) return pasa("supera_umbral")
  return { retener: true, motivo: "reverso_bajo_umbral" }
}
