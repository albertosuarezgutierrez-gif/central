// Motor de precio ANCLADO AL MERCADO — FUENTE ÚNICA del cálculo.
// Lo consumen `recommend`, `settings` (panel) y `pilot-track` (agente) para que el
// "precio recomendado" sea el mismo en todos. Es lógica pura (sin DB ni red).
//
// `computeRecommendation` devuelve el precio a nivel MERCADO (huésped) acotado a [floor, ceil].
// NO aplica min_price/max_price: cada consumidor los aplica en SUS unidades —
//   · recommend  → sobre el huésped (comportamiento histórico; ver nota en docs/pricing-automatico.md)
//   · settings/agente → sobre la BASE (€ reales), vía `recommendedBaseFromEngine`.

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

  // CALIDAD: nuestras reseñas vs la mediana del mercado, acotado ±10%.
  const qualityFactor = (p.own_score != null && mktScore != null)
    ? clamp(1 + (Number(p.own_score) - mktScore) * Number(p.quality_k), 0.90, 1.10)
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
  opts: { markup: number; max_change_pct: number; min_price: number | null; max_price: number | null; baseActual: number | null },
): number | null {
  if (res.guest == null || res.basis == null) return null
  const markup = opts.markup > 1 ? opts.markup : 1.16
  let base = Math.round(res.guest / markup)
  const floorBase = Math.round(res.basis.floorRaw / markup), ceilBase = Math.round(res.basis.ceilRaw / markup)
  base = clamp(base, floorBase, ceilBase)
  if (opts.baseActual != null) {
    base = clamp(base, Math.round(opts.baseActual * (1 - opts.max_change_pct)),
      Math.round(opts.baseActual * (1 + opts.max_change_pct)))
  }
  if (opts.min_price != null) base = Math.max(base, opts.min_price)
  if (opts.max_price != null) base = Math.min(base, opts.max_price)
  return base
}
