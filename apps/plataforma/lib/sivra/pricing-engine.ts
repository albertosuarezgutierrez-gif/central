// Motor de precio ANCLADO AL MERCADO — FUENTE ÚNICA del cálculo.
// Lo consumen `recommend`, `settings` (panel) y `pilot-track` (agente) para que el
// "precio recomendado" sea el mismo en todos. Es lógica pura (sin DB ni red).
//
// `computeRecommendation` devuelve el precio a nivel MERCADO (huésped) acotado a [floor, ceil].
// NO aplica min_price/max_price: cada consumidor los aplica en SUS unidades —
//   · recommend  → sobre el huésped (comportamiento histórico; ver nota en docs/pricing-automatico.md)
//   · settings/agente → sobre la BASE (€ reales), vía `recommendedBaseFromEngine`.

import { baseDesdeGuestConFijo } from "./pricing-canal.ts"

export const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x))

// Percentil con interpolación lineal sobre una muestra ordenada (ascendente).
export function percentile(sorted: number[], q: number): number {
  if (sorted.length === 0) return NaN
  if (sorted.length === 1) return sorted[0]
  const idx = clamp(q, 0, 1) * (sorted.length - 1)
  const lo = Math.floor(idx), hi = Math.ceil(idx)
  if (lo === hi) return sorted[lo]
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo)
}

export type EngineParams = {
  target_pctl: number; floor_pctl: number; ceil_pctl: number
  position_factor: number; quality_k: number; demand_k: number; demand_baseline: number
  own_score: number | null
}

export type EngineBasis = {
  target_price: number; floor: number; ceil: number; median: number
  floorRaw: number; ceilRaw: number   // sin redondear, para la conversión a base (paridad con settings)
  quality_factor: number; demand_factor: number
  occupancy: number | null; market_score_median: number | null; sample: number
}

export type EngineResult = {
  guest: number | null            // precio mercado (huésped), acotado a [floor, ceil], SIN min/max
  basis: EngineBasis | null
  confidence: "alta" | "baja" | "sin_datos"   // "alta" si ≥5 comparables
}

export function computeRecommendation(
  p: EngineParams,
  marketPrices: number[],
  marketScores: number[],
  occupancy: number | null,
): EngineResult {
  if (!marketPrices || marketPrices.length === 0) {
    return { guest: null, basis: null, confidence: "sin_datos" }
  }
  const prices = [...marketPrices].sort((a, b) => a - b)
  const scores = [...marketScores].sort((a, b) => a - b)
  const target = percentile(prices, p.target_pctl)
  const floor = percentile(prices, p.floor_pctl)
  const ceil = percentile(prices, p.ceil_pctl)
  const mktScore = scores.length ? percentile(scores, 0.5) : null

  // CALIDAD: nuestras reseñas vs la mediana del mercado. Acotado +10% / −25%.
  //
  // 🚨 El suelo era 0,90 y ESO era el problema (03/09/2026): con el corpus sin filtrar por liga, la
  // brecha real de Busto era de 1,9 puntos (6,9 contra 8,8) y el clamp la traducía en un −10% —
  // el descuento máximo que el motor podía aplicar por ser peor que TODOS sus comparables.
  // Ahora la corrección vive sobre todo en la SELECCIÓN del corpus (`pricing-comps-liga.ts`), que
  // es donde corresponde, y este factor queda de red: con el corpus ya en nuestra liga la brecha
  // cae a 0,3-0,9 puntos y el factor apenas se mueve (0,93-0,98 medido). El suelo más bajo está
  // para el día que el corpus vuelva a irse, no para hacer el trabajo del filtro.
  const qualityFactor = (p.own_score != null && mktScore != null)
    ? clamp(1 + (Number(p.own_score) - mktScore) * Number(p.quality_k), 0.75, 1.10)
    : 1.0
  // DEMANDA: ocupación propia vs ocupación neutra, acotado ±~8%.
  const demandFactor = (occupancy != null && Number.isFinite(occupancy))
    ? clamp(1 + (occupancy - Number(p.demand_baseline)) * Number(p.demand_k), 0.92, 1.10)
    : 1.0

  let guest = Math.round(target * Number(p.position_factor) * qualityFactor * demandFactor)
  guest = clamp(guest, Math.round(floor), Math.round(ceil))

  return {
    guest,
    basis: {
      target_price: Math.round(target), floor: Math.round(floor), ceil: Math.round(ceil),
      floorRaw: floor, ceilRaw: ceil,
      median: Math.round(percentile(prices, 0.5)),
      quality_factor: Number(qualityFactor.toFixed(3)),
      demand_factor: Number(demandFactor.toFixed(3)),
      occupancy: occupancy != null && Number.isFinite(occupancy) ? Number(occupancy.toFixed(2)) : null,
      market_score_median: mktScore != null ? Number(mktScore.toFixed(1)) : null,
      sample: prices.length,
    },
    confidence: prices.length >= 5 ? "alta" : "baja",
  }
}

// Convierte el recomendado (huésped) a precio BASE de Smoobu y aplica la cadena de topes del
// propietario: floor/ceil de mercado (en base) → max_change_pct vs base actual → min/max absolutos.
// Es la cadena que ya usaba `settings`; el agente la reusa para proponer el MISMO número.
export function recommendedBaseFromEngine(
  res: EngineResult,
  opts: {
    markup: number; max_change_pct: number; min_price: number | null; max_price: number | null
    baseActual: number | null
    /** parte FIJA que el canal suma a la noche (cuota por estancia ÷ noches típicas del piso) */
    fijoNoche?: number
  },
): number | null {
  if (res.guest == null || res.basis == null) return null
  // 🚨 NO se filtra el markup por `>= 1`. El canal MEDIDO es ~0,9 (multiplica por menos de uno y
  // suma una cuota fija, 19/08/2026): con la guarda vieja, el valor real se descartaba en silencio
  // y se dividía por un 1,16 inventado — el mismo fallo mudo que la guarda `> 1` que sustituyó.
  // Solo se rechaza lo imposible (≤0), y entonces se dice dividiendo por 1 (identidad), no por un
  // número de fantasía.
  const markup = opts.markup > 0 ? opts.markup : 1
  const fijo = Number(opts.fijoNoche) > 0 ? Number(opts.fijoNoche) : 0
  let base = baseDesdeGuestConFijo(res.guest, markup, fijo)
  const floorBase = baseDesdeGuestConFijo(res.basis.floorRaw, markup, fijo)
  const ceilBase = baseDesdeGuestConFijo(res.basis.ceilRaw, markup, fijo)
  base = clamp(base, floorBase, ceilBase)
  if (opts.baseActual != null) {
    base = clamp(base, Math.round(opts.baseActual * (1 - opts.max_change_pct)),
      Math.round(opts.baseActual * (1 + opts.max_change_pct)))
  }
  if (opts.min_price != null) base = Math.max(base, opts.min_price)
  if (opts.max_price != null) base = Math.min(base, opts.max_price)
  return base
}
