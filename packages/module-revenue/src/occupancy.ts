import type { CapacitySlot, AnalysisConfig, DowOccupancy, MonthSeasonality } from './types'
import { dow, monthOf } from './util.ts'

const DEFAULT_MIN_SAMPLE = 8

/**
 * Ocupación media por día de la semana, ponderada por capacidad.
 * 0=domingo … 6=sábado. `enough` indica si hay muestra suficiente para fiarse.
 */
export function occupancyByDow(slots: CapacitySlot[], cfg?: AnalysisConfig): DowOccupancy[] {
  const min = cfg?.minSample ?? DEFAULT_MIN_SAMPLE
  const cap = new Array(7).fill(0)
  const used = new Array(7).fill(0)
  const n = new Array(7).fill(0)
  for (const s of slots) {
    if (s.capacity <= 0) continue
    const d = dow(s.date)
    cap[d] += s.capacity
    used[d] += s.used
    n[d] += 1
  }
  const out: DowOccupancy[] = []
  for (let d = 0; d < 7; d++) {
    out.push({
      dow: d,
      occupancy: cap[d] > 0 ? used[d] / cap[d] : 0,
      sample: n[d],
      enough: n[d] >= min,
    })
  }
  return out
}

/**
 * Índice de estacionalidad por mes (1..12), relativo a la media anual ponderada.
 * `index` = ocupación del mes / ocupación media. 1.0 = en la media.
 */
export function seasonalityByMonth(slots: CapacitySlot[], cfg?: AnalysisConfig): MonthSeasonality[] {
  const min = cfg?.minSample ?? DEFAULT_MIN_SAMPLE
  const cap = new Array(13).fill(0)
  const used = new Array(13).fill(0)
  const n = new Array(13).fill(0)
  for (const s of slots) {
    if (s.capacity <= 0) continue
    const m = monthOf(s.date)
    cap[m] += s.capacity
    used[m] += s.used
    n[m] += 1
  }
  let totUsed = 0
  let totCap = 0
  for (let m = 1; m <= 12; m++) {
    totUsed += used[m]
    totCap += cap[m]
  }
  const avg = totCap > 0 ? totUsed / totCap : 0
  const out: MonthSeasonality[] = []
  for (let m = 1; m <= 12; m++) {
    const occ = cap[m] > 0 ? used[m] / cap[m] : 0
    out.push({
      month: m,
      index: avg > 0 ? occ / avg : 1,
      occupancy: occ,
      sample: n[m],
      enough: n[m] >= min,
    })
  }
  return out
}
