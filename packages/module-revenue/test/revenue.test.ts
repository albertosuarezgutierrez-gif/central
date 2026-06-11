// Tests de la lógica PURA de @central/module-revenue.
// Se ejecutan con el runner de Node (type-stripping): `node --test`.
// Importan los ficheros src con extensión .ts explícita.

import { test } from 'node:test'
import assert from 'node:assert/strict'

import { occupancyByDow, seasonalityByMonth } from '../src/occupancy.ts'
import { leadTimeStats, pickupCurve, paceVsBaseline } from '../src/demand.ts'
import { channelMix, revenueKpis } from '../src/revenue.ts'
import type { CapacitySlot, DemandEvent } from '../src/types.ts'

/** Fecha UTC desde 'YYYY-MM-DD'. */
const d = (s: string) => new Date(s + 'T00:00:00Z')
const DAY = 86_400_000

test('occupancyByDow: detecta domingos llenos y el resto vacío', () => {
  // 8 semanas desde un domingo (2025-01-05). Domingo lleno, resto vacío.
  const slots: CapacitySlot[] = []
  const start = d('2025-01-05') // domingo
  for (let i = 0; i < 56; i++) {
    const date = new Date(start.getTime() + i * DAY)
    const isSunday = date.getUTCDay() === 0
    slots.push({ unitId: 'p1', date, capacity: 1, used: isSunday ? 1 : 0 })
  }
  const res = occupancyByDow(slots)
  const sunday = res.find((r) => r.dow === 0)!
  const monday = res.find((r) => r.dow === 1)!
  assert.equal(sunday.occupancy, 1)
  assert.equal(sunday.sample, 8)
  assert.equal(sunday.enough, true)
  assert.equal(monday.occupancy, 0)
})

test('occupancyByDow: guardia de muestra (enough=false con pocos datos)', () => {
  const slots: CapacitySlot[] = [
    { unitId: 'p1', date: d('2025-01-05'), capacity: 1, used: 1 }, // un solo domingo
  ]
  const res = occupancyByDow(slots, { minSample: 8 })
  assert.equal(res.find((r) => r.dow === 0)!.enough, false)
})

test('seasonalityByMonth: el mes pico tiene índice > 1 y el flojo < 1', () => {
  const slots: CapacitySlot[] = []
  // Julio lleno (occ 1), enero vacío (occ 0); 10 días de cada uno.
  for (let i = 1; i <= 10; i++) {
    slots.push({ unitId: 'p1', date: d(`2025-07-${String(i).padStart(2, '0')}`), capacity: 1, used: 1 })
    slots.push({ unitId: 'p1', date: d(`2025-01-${String(i).padStart(2, '0')}`), capacity: 1, used: 0 })
  }
  const res = seasonalityByMonth(slots)
  const jul = res.find((r) => r.month === 7)!
  const ene = res.find((r) => r.month === 1)!
  assert.equal(jul.occupancy, 1)
  assert.equal(ene.occupancy, 0)
  assert.ok(jul.index > 1, `julio index ${jul.index} debe ser > 1`)
  assert.ok(ene.index < 1, `enero index ${ene.index} debe ser < 1`)
})

test('leadTimeStats: media y mediana de antelaciones conocidas', () => {
  const leads = [0, 10, 20, 30, 40]
  const events: DemandEvent[] = leads.map((l, i) => ({
    unitId: 'p1',
    start: d('2025-06-01'),
    createdAt: new Date(d('2025-06-01').getTime() - l * DAY),
    value: 100,
    quantity: 1,
  }))
  const res = leadTimeStats(events)
  assert.equal(res.sample, 5)
  assert.equal(res.meanDays, 20)
  assert.equal(res.medianDays, 20)
})

test('leadTimeStats: excluye canceladas', () => {
  const events: DemandEvent[] = [
    { unitId: 'p1', start: d('2025-06-01'), createdAt: d('2025-05-22'), value: 100, status: 'confirmed' },
    { unitId: 'p1', start: d('2025-06-01'), createdAt: d('2025-05-01'), value: 100, status: 'cancelled' },
  ]
  assert.equal(leadTimeStats(events).sample, 1)
})

test('pickupCurve: acumulado por días antes del check-in', () => {
  const events: DemandEvent[] = [
    { unitId: 'p1', start: d('2025-07-10'), createdAt: new Date(d('2025-07-10').getTime() - 5 * DAY), value: 100 },
    { unitId: 'p1', start: d('2025-07-12'), createdAt: new Date(d('2025-07-12').getTime() - 30 * DAY), value: 100 },
  ]
  const curve = pickupCurve(events, d('2025-07-01'), d('2025-08-01'), 60)
  const at = (n: number) => curve.find((p) => p.daysBefore === n)!.bookings
  assert.equal(at(40), 0) // ninguna con antelación >= 40
  assert.equal(at(30), 1) // solo la de 30
  assert.equal(at(5), 2) // ambas
  assert.equal(at(0), 2)
})

test('paceVsBaseline: +100% si este año va al doble al mismo punto', () => {
  const events: DemandEvent[] = [
    // Periodo actual: julio 2026, 2 reservas creadas antes del corte (1 jun 2026)
    { unitId: 'p1', start: d('2026-07-10'), createdAt: d('2026-05-01'), value: 100 },
    { unitId: 'p1', start: d('2026-07-20'), createdAt: d('2026-05-15'), value: 100 },
    // 1 creada DESPUÉS del corte → no cuenta
    { unitId: 'p1', start: d('2026-07-25'), createdAt: d('2026-06-15'), value: 100 },
    // Base: julio 2025, 1 reserva antes del corte (1 jun 2025)
    { unitId: 'p1', start: d('2025-07-10'), createdAt: d('2025-05-01'), value: 100 },
  ]
  const res = paceVsBaseline(
    events,
    { start: d('2026-07-01'), end: d('2026-08-01'), label: 'jul-2026' },
    { start: d('2025-07-01'), end: d('2025-08-01') },
    30, // a 30 días del inicio
  )
  assert.equal(res.currentBookings, 2)
  assert.equal(res.baselineBookings, 1)
  assert.equal(res.deltaPct, 1)
})

test('channelMix: reparto y ADR por canal, ordenado', () => {
  const events: DemandEvent[] = [
    { unitId: 'p1', start: d('2025-06-01'), end: d('2025-06-03'), createdAt: d('2025-05-01'), value: 100, channel: 'BOOKING' },
    { unitId: 'p1', start: d('2025-06-05'), end: d('2025-06-07'), createdAt: d('2025-05-01'), value: 100, channel: 'BOOKING' },
    { unitId: 'p1', start: d('2025-06-10'), end: d('2025-06-11'), createdAt: d('2025-05-01'), value: 90, channel: 'AIRBNB' },
  ]
  const res = channelMix(events)
  assert.equal(res[0].channel, 'BOOKING')
  assert.equal(res[0].bookings, 2)
  assert.ok(Math.abs(res[0].share - 2 / 3) < 1e-9)
  assert.equal(res[0].adr, 50) // 200€ / 4 noches
  assert.equal(res[1].channel, 'AIRBNB')
  assert.equal(res[1].adr, 90) // 90€ / 1 noche
})

test('revenueKpis: ocupación de slots, ADR/RevPAR de eventos', () => {
  const events: DemandEvent[] = [
    { unitId: 'p1', start: d('2025-06-01'), end: d('2025-06-04'), createdAt: d('2025-05-01'), value: 300 }, // 3 noches
    { unitId: 'p1', start: d('2025-06-10'), end: d('2025-06-13'), createdAt: d('2025-05-01'), value: 300 }, // 3 noches
  ]
  const slots: CapacitySlot[] = []
  for (let i = 0; i < 10; i++) {
    slots.push({ unitId: 'p1', date: new Date(d('2025-06-01').getTime() + i * DAY), capacity: 1, used: i < 6 ? 1 : 0 })
  }
  const k = revenueKpis(events, slots)
  assert.equal(k.capacity, 10)
  assert.equal(k.nights, 6)
  assert.equal(k.occupancy, 0.6)
  assert.equal(k.revenue, 600)
  assert.equal(k.adr, 100) // 600€ / 6 noches vendidas
  assert.equal(k.revpar, 60) // 600€ / 10 disponibles
})
