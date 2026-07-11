// Tests de la lógica pura de cobros OTA. Runner: `node --test` (type-stripping, Node >=22).
import { test } from 'node:test'
import assert from 'node:assert/strict'

import { reconciliarCobrosOTA, type ReservaOTA, type AbonoOTA } from './cobros-ota.ts'

const HOY = '2026-06-24'

// Por defecto bruto = neto salvo que el test lo fije aparte.
function reserva(p: Partial<ReservaOTA> & { reservationId: string; checkOut: string; neto: number }): ReservaOTA {
  return { canal: 'BOOKING', guestName: 'Test', bruto: p.bruto ?? p.neto, ...p }
}

test('reserva pagada (abono ≈ bruto dentro de plazo) → no pendiente', () => {
  const reservas = [reserva({ reservationId: 'A', checkOut: '2026-06-10', neto: 160, bruto: 200 })]
  const abonos: AbonoOTA[] = [{ fecha: '2026-06-12', importe: 200 }] // paga el BRUTO
  const r = reconciliarCobrosOTA(reservas, abonos, HOY)
  assert.equal(r.hayDescuadre, false)
  assert.equal(r.pendientes.length, 0)
})

test('el cuadre es contra el BRUTO, no el neto: un abono por el neto NO cubre', () => {
  // Booking ingresa el bruto; si solo entrara el neto, la reserva queda descubierta por la comisión.
  const reservas = [reserva({ reservationId: 'A', checkOut: '2026-06-01', neto: 820, bruto: 1000 })]
  const abonos: AbonoOTA[] = [{ fecha: '2026-06-03', importe: 820 }]
  const r = reconciliarCobrosOTA(reservas, abonos, HOY)
  assert.equal(r.pendientes.length, 1)
  assert.equal(r.pendientes[0].descubierto, 180) // 1000 - 820
})

test('UN abono agrupado cubre VARIAS reservas (liquidación Booking)', () => {
  const reservas = [
    reserva({ reservationId: 'A', checkOut: '2026-06-05', neto: 250, bruto: 300 }),
    reserva({ reservationId: 'B', checkOut: '2026-06-06', neto: 290, bruto: 350 }),
  ]
  const abonos: AbonoOTA[] = [{ fecha: '2026-06-10', importe: 650 }] // 300 + 350 agrupadas
  const r = reconciliarCobrosOTA(reservas, abonos, HOY)
  assert.equal(r.pendientes.length, 0)
  assert.equal(r.pendientesEur, 0)
  assert.equal(r.huerfanosEur, 0)
})

test('VARIOS abonos suman para cubrir una reserva grande', () => {
  const reservas = [reserva({ reservationId: 'A', checkOut: '2026-06-01', neto: 820, bruto: 1000 })]
  const abonos: AbonoOTA[] = [
    { fecha: '2026-06-02', importe: 400 },
    { fecha: '2026-06-04', importe: 600 },
  ]
  const r = reconciliarCobrosOTA(reservas, abonos, HOY)
  assert.equal(r.pendientes.length, 0)
})

test('reserva vencida sin abono y pasada de plazo → pendiente por el bruto', () => {
  const reservas = [reserva({ reservationId: 'A', checkOut: '2026-06-05', neto: 500, bruto: 610 })] // +10d = 15, < 24
  const r = reconciliarCobrosOTA(reservas, [], HOY)
  assert.equal(r.hayDescuadre, true) // 610 > umbral 500
  assert.equal(r.pendientes.length, 1)
  assert.equal(r.pendientes[0].descubierto, 610)
  assert.equal(r.pendientesEur, 610)
})

test('reserva reciente DENTRO del margen → no avisa aunque no haya abono', () => {
  const reservas = [reserva({ reservationId: 'A', checkOut: '2026-06-20', neto: 500, bruto: 610 })] // +10d = 30 > 24
  const r = reconciliarCobrosOTA(reservas, [], HOY)
  assert.equal(r.hayDescuadre, false)
  assert.equal(r.pendientes.length, 0)
})

test('un abono que entra DESPUÉS del vencimiento no cubre la reserva', () => {
  const reservas = [reserva({ reservationId: 'A', checkOut: '2026-06-01', neto: 500, bruto: 600 })] // vence 11
  const abonos: AbonoOTA[] = [{ fecha: '2026-06-20', importe: 600 }] // entró tarde
  const r = reconciliarCobrosOTA(reservas, abonos, HOY)
  assert.equal(r.pendientes.length, 1)
  assert.equal(r.huerfanosEur, 600) // el dinero está, pero llegó fuera de plazo → sobrante
})

test('Expedia usa margen largo (40d): a 20 días aún no avisa', () => {
  const reservas = [reserva({ reservationId: 'A', canal: 'EXPEDIA', checkOut: '2026-06-04', neto: 500, bruto: 600 })]
  const r = reconciliarCobrosOTA(reservas, [], HOY)
  assert.equal(r.hayDescuadre, false)
  assert.equal(r.pendientes.length, 0)
})

test('descuadre agregado por debajo del umbral (500€) no dispara', () => {
  const reservas = [reserva({ reservationId: 'A', checkOut: '2026-06-01', neto: 300, bruto: 300 })]
  const r = reconciliarCobrosOTA(reservas, [], HOY)
  assert.equal(r.pendientes.length, 1)   // sí queda descubierta
  assert.equal(r.hayDescuadre, false)    // pero 300 < 500 → no cría el lobo
})

test('holgura de céntimos: falta 0,50€ no cuenta como descubierto', () => {
  const reservas = [reserva({ reservationId: 'A', checkOut: '2026-06-05', neto: 500, bruto: 600 })]
  const abonos: AbonoOTA[] = [{ fecha: '2026-06-08', importe: 599.5 }]
  const r = reconciliarCobrosOTA(reservas, abonos, HOY)
  assert.equal(r.pendientes.length, 0)
})

test('libro que cuadra en agregado: pool ≥ bruto → cero pendientes (caso real)', () => {
  // Reproduce el patrón real: muchas reservas, pagadas por liquidaciones agrupadas y netas-de-nada.
  const reservas = [
    reserva({ reservationId: 'A', checkOut: '2026-06-01', neto: 160, bruto: 200 }),
    reserva({ reservationId: 'B', checkOut: '2026-06-03', neto: 240, bruto: 300 }),
    reserva({ reservationId: 'C', checkOut: '2026-06-05', neto: 400, bruto: 500 }),
  ]
  const abonos: AbonoOTA[] = [
    { fecha: '2026-06-06', importe: 500 }, // agrupa A+B
    { fecha: '2026-06-09', importe: 520 }, // cubre C + sobrante
  ]
  const r = reconciliarCobrosOTA(reservas, abonos, HOY)
  assert.equal(r.pendientes.length, 0)
  assert.equal(r.pendientesEur, 0)
  assert.equal(r.hayDescuadre, false)
})
