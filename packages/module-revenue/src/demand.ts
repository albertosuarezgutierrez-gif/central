import type { DemandEvent, LeadTimeStats, PickupPoint, PaceResult } from './types'
import { daysBetween, mean, percentile } from './util.ts'

const DAY_MS = 86_400_000

function confirmed(events: DemandEvent[]): DemandEvent[] {
  return events.filter((e) => e.status !== 'cancelled')
}

/** Estadísticos de antelación (días entre creación de la reserva y check-in). */
export function leadTimeStats(events: DemandEvent[]): LeadTimeStats {
  const leads = confirmed(events)
    .map((e) => daysBetween(e.createdAt, e.start))
    .filter((d) => d >= 0)
    .sort((a, b) => a - b)
  return {
    sample: leads.length,
    meanDays: Math.round(mean(leads) || 0),
    medianDays: Math.round(percentile(leads, 0.5) || 0),
    p10Days: Math.round(percentile(leads, 0.1) || 0),
    p90Days: Math.round(percentile(leads, 0.9) || 0),
  }
}

/**
 * Curva de pickup para las reservas cuyo check-in cae en [periodStart, periodEnd).
 * Para cada `daysBefore` (de maxDaysBefore..0), cuántas reservas ya existían a esa
 * antelación del check-in. Curva acumulada (no decreciente al acercarse a 0).
 */
export function pickupCurve(
  events: DemandEvent[],
  periodStart: Date,
  periodEnd: Date,
  maxDaysBefore = 120,
): PickupPoint[] {
  const leads = confirmed(events)
    .filter((e) => e.start >= periodStart && e.start < periodEnd)
    .map((e) => Math.max(0, daysBetween(e.createdAt, e.start)))
  const pts: PickupPoint[] = []
  for (let d = maxDaysBefore; d >= 0; d--) {
    pts.push({ daysBefore: d, bookings: leads.filter((l) => l >= d).length })
  }
  return pts
}

/**
 * Ritmo de venta (pace) de un periodo vs un periodo base (p.ej. mismo mes el año
 * anterior), medido al MISMO punto relativo: reservas con check-in dentro del
 * periodo creadas hasta `asOfDaysBeforeStart` días antes del inicio del periodo.
 */
export function paceVsBaseline(
  events: DemandEvent[],
  period: { start: Date; end: Date; label?: string },
  baseline: { start: Date; end: Date },
  asOfDaysBeforeStart: number,
): PaceResult {
  const c = confirmed(events)
  const cutPeriod = new Date(period.start.getTime() - asOfDaysBeforeStart * DAY_MS)
  const cutBase = new Date(baseline.start.getTime() - asOfDaysBeforeStart * DAY_MS)
  const cur = c.filter(
    (e) => e.start >= period.start && e.start < period.end && e.createdAt <= cutPeriod,
  ).length
  const base = c.filter(
    (e) => e.start >= baseline.start && e.start < baseline.end && e.createdAt <= cutBase,
  ).length
  return {
    period: period.label ?? '',
    currentBookings: cur,
    baselineBookings: base,
    deltaPct: base > 0 ? (cur - base) / base : null,
  }
}
