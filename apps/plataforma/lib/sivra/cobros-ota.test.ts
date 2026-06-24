// Tests de la lógica pura de cobros OTA. Runner: `node --test` (type-stripping, Node >=22).
import { test } from 'node:test'
import assert from 'node:assert/strict'

import { reconciliarCobrosOTA, type ReservaOTA, type AbonoOTA } from './cobros-ota.ts'

const HOY = '2026-06-24'

function reserva(p: Partial<ReservaOTA> & { reservationId: string; checkOut: string; neto: number }): ReservaOTA {
  return { canal: 'BOOKING', guestName: 'Test', ...p }
}

test('reserva pagada (abono que casa importe+fecha) → no pendiente', () => {
  const reservas = [reserva({ reservationId: 'A', checkOut: '2026-06-10', neto: 200 })]
  const abonos: AbonoOTA[] = [{ fecha: '2026-06-12', importe: 200 }]
  const r = reconciliarCobrosOTA(reservas, abonos, HOY)
  assert.equal(r.hayDescuadre, false)
  assert.equal(r.pendientes.length, 0)
  assert.equal(r.huerfanos.length, 0)
})

test('reserva con checkout pasado de margen y sin abono → pendiente y descuadre', () => {
  const reservas = [reserva({ reservationId: 'A', checkOut: '2026-06-10', neto: 200 })] // +7d = 17, < 24
  const r = reconciliarCobrosOTA(reservas, [], HOY)
  assert.equal(r.hayDescuadre, true)
  assert.equal(r.pendientes.length, 1)
  assert.equal(r.pendientes[0].reservationId, 'A')
  assert.equal(r.pendientesEur, 200)
})

test('reserva reciente DENTRO del margen → no avisa aunque no haya abono', () => {
  const reservas = [reserva({ reservationId: 'A', checkOut: '2026-06-22', neto: 200 })] // +7d = 29 > 24
  const r = reconciliarCobrosOTA(reservas, [], HOY)
  assert.equal(r.hayDescuadre, false)
  assert.equal(r.pendientes.length, 0)
})

test('Expedia usa margen largo (35d): a 20 días aún no avisa', () => {
  const reservas = [reserva({ reservationId: 'A', canal: 'EXPEDIA', checkOut: '2026-06-04', neto: 200 })] // +35 = jul9
  const r = reconciliarCobrosOTA(reservas, [], HOY)
  assert.equal(r.hayDescuadre, false)
  assert.equal(r.pendientes.length, 0)
})

test('importe por debajo del umbral (50€) no dispara', () => {
  const reservas = [reserva({ reservationId: 'A', checkOut: '2026-06-01', neto: 40 })]
  const r = reconciliarCobrosOTA(reservas, [], HOY)
  assert.equal(r.hayDescuadre, false)
  assert.equal(r.pendientes.length, 1) // sí es pendiente, pero por debajo de umbral no avisa
})

test('mismo importe en dos reservas: cada abono se usa una sola vez', () => {
  const reservas = [
    reserva({ reservationId: 'A', checkOut: '2026-06-05', neto: 150 }),
    reserva({ reservationId: 'B', checkOut: '2026-06-06', neto: 150 }),
  ]
  const abonos: AbonoOTA[] = [{ fecha: '2026-06-08', importe: 150 }] // solo cubre una
  const r = reconciliarCobrosOTA(reservas, abonos, HOY)
  assert.equal(r.pendientes.length, 1) // la otra queda pendiente
  assert.equal(r.huerfanos.length, 0)
})

test('abono sin reserva que case → huérfano (pero NO dispara solo en v1)', () => {
  const abonos: AbonoOTA[] = [{ fecha: '2026-06-10', importe: 999 }]
  const r = reconciliarCobrosOTA([], abonos, HOY)
  assert.equal(r.hayDescuadre, false)
  assert.equal(r.huerfanos.length, 1)
  assert.equal(r.huerfanosEur, 999)
})

test('tolerancia de céntimos: 200.01 casa con 200.00', () => {
  const reservas = [reserva({ reservationId: 'A', checkOut: '2026-06-10', neto: 200 })]
  const abonos: AbonoOTA[] = [{ fecha: '2026-06-12', importe: 200.01 }]
  const r = reconciliarCobrosOTA(reservas, abonos, HOY)
  assert.equal(r.pendientes.length, 0)
})
