import type { DemandEvent, CapacitySlot, ChannelShare, RevenueKpis } from './types'
import { nightsOf } from './util.ts'

function confirmed(events: DemandEvent[]): DemandEvent[] {
  return events.filter((e) => e.status !== 'cancelled')
}

/** Reparto de reservas por canal + ADR (ingreso medio por noche) de cada canal. */
export function channelMix(events: DemandEvent[]): ChannelShare[] {
  const c = confirmed(events)
  const total = c.length
  const by = new Map<string, { bookings: number; revenue: number; nights: number }>()
  for (const e of c) {
    const ch = e.channel ?? 'OTRO'
    const g = by.get(ch) ?? { bookings: 0, revenue: 0, nights: 0 }
    g.bookings += 1
    g.revenue += e.value
    g.nights += nightsOf(e)
    by.set(ch, g)
  }
  const out: ChannelShare[] = []
  for (const [channel, g] of by) {
    out.push({
      channel,
      bookings: g.bookings,
      share: total > 0 ? g.bookings / total : 0,
      adr: g.nights > 0 ? g.revenue / g.nights : 0,
    })
  }
  return out.sort((a, b) => b.bookings - a.bookings)
}

/**
 * KPIs del periodo. Ocupación/noches/capacidad salen de `slots` (verdad de
 * disponibilidad); ingresos/ADR salen de `events`. RevPAR = ingresos / capacidad.
 */
export function revenueKpis(events: DemandEvent[], slots: CapacitySlot[]): RevenueKpis {
  const c = confirmed(events)
  const revenue = c.reduce((s, e) => s + e.value, 0)
  const soldNights = c.reduce((s, e) => s + nightsOf(e), 0)
  const capacity = slots.reduce((s, x) => s + x.capacity, 0)
  const usedNights = slots.reduce((s, x) => s + x.used, 0)
  const nights = capacity > 0 ? usedNights : soldNights
  return {
    nights,
    capacity,
    occupancy: capacity > 0 ? usedNights / capacity : 0,
    revenue,
    adr: soldNights > 0 ? revenue / soldNights : 0,
    revpar: capacity > 0 ? revenue / capacity : 0,
  }
}
