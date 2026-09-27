import { test } from 'node:test'
import assert from 'node:assert'
import { nocheAnteriorLibre, diaAnterior, restarDias, entradaMismoDiaLibre, sumarDias, estanciasFiables } from './disponibilidad.ts'

test('diaAnterior / restarDias', () => {
  assert.equal(diaAnterior('2026-06-26'), '2026-06-25')
  assert.equal(restarDias('2026-06-26', 30), '2026-05-27')
  assert.equal(diaAnterior('no-fecha'), '')
})

test('sin otras estancias → la noche anterior está libre', () => {
  assert.equal(nocheAnteriorLibre('2026-06-26', []), true)
})

test('una reserva que SALE el mismo día de la llegada → noche anterior OCUPADA', () => {
  const otras = [{ id: 'A', arrival: '2026-06-24', departure: '2026-06-26' }]
  assert.equal(nocheAnteriorLibre('2026-06-26', otras), false)
})

test('una reserva que salió el día ANTERIOR → noche anterior libre', () => {
  const otras = [{ id: 'A', arrival: '2026-06-23', departure: '2026-06-25' }]
  assert.equal(nocheAnteriorLibre('2026-06-26', otras), true)
})

test('estancia que cubre la víspera (entra antes, sale después) → ocupada', () => {
  const otras = [{ id: 'A', arrival: '2026-06-20', departure: '2026-06-28' }]
  assert.equal(nocheAnteriorLibre('2026-06-26', otras), false)
})

test('la PROPIA reserva no cuenta como ocupación', () => {
  const otras = [{ id: 'SELF', arrival: '2026-06-26', departure: '2026-06-28' }]
  assert.equal(nocheAnteriorLibre('2026-06-26', otras, 'SELF'), true)
})

test('las cancelaciones no ocupan', () => {
  const otras = [{ id: 'A', arrival: '2026-06-24', departure: '2026-06-26', type: 'cancellation' }]
  assert.equal(nocheAnteriorLibre('2026-06-26', otras), true)
})

test('una reserva que llega el MISMO día de la llegada no ocupa la víspera', () => {
  const otras = [{ id: 'A', arrival: '2026-06-26', departure: '2026-06-30' }]
  assert.equal(nocheAnteriorLibre('2026-06-26', otras), true)
})

test('sumarDias', () => {
  assert.equal(sumarDias('2026-07-26', 2), '2026-07-28')
  assert.equal(sumarDias('no-fecha', 2), '')
})

test('sin otras estancias → el día de salida está libre para late check-out', () => {
  assert.equal(entradaMismoDiaLibre('2026-07-26', []), true)
})

test('otra reserva ENTRA el mismo día de la salida → OCUPADO (no hay late check-out)', () => {
  const otras = [{ id: 'B', arrival: '2026-07-26', departure: '2026-07-28' }]
  assert.equal(entradaMismoDiaLibre('2026-07-26', otras), false)
})

test('la siguiente reserva entra DÍAS después de la salida → libre', () => {
  const otras = [{ id: 'B', arrival: '2026-08-01', departure: '2026-08-13' }]
  assert.equal(entradaMismoDiaLibre('2026-07-26', otras), true)
})

test('la PROPIA reserva no cuenta como ocupación (late check-out)', () => {
  const otras = [{ id: 'SELF', arrival: '2026-07-26', departure: '2026-07-26' }]
  assert.equal(entradaMismoDiaLibre('2026-07-26', otras, 'SELF'), true)
})

test('las cancelaciones no ocupan (late check-out)', () => {
  const otras = [{ id: 'B', arrival: '2026-07-26', departure: '2026-07-28', type: 'cancellation' }]
  assert.equal(entradaMismoDiaLibre('2026-07-26', otras), true)
})

test('sin fecha de salida fiable → conservador (NO libre)', () => {
  assert.equal(entradaMismoDiaLibre('', []), false)
})

test('estanciasFiables: filtra por piso y conserva la que sale el día de llegada', () => {
  const resp = { page_count: 1, bookings: [
    { id: 'A', arrival: '2026-09-25', departure: '2026-09-28', apartment: { id: 1 } },
    { id: 'B', arrival: '2026-09-26', departure: '2026-09-29', apartment: { id: 2 } },
  ] }
  const est = estanciasFiables(resp, { apartmentId: 1, campo: 'departure', desde: '2026-09-28', hasta: '2026-10-28' })
  assert.deepEqual(est?.map(e => e.id), ['A'])
  assert.equal(nocheAnteriorLibre('2026-09-28', est!, 'X'), false)
})

test('estanciasFiables: filtro ignorado (estancia fuera de ventana) → null, no «libre»', () => {
  const resp = { bookings: [{ id: 'V', arrival: '2026-08-01', departure: '2026-08-03', apartment: { id: 1 } }] }
  assert.equal(estanciasFiables(resp, { apartmentId: 1, campo: 'departure', desde: '2026-09-28', hasta: '2026-10-28' }), null)
})

test('estanciasFiables: paginada o ilegible → null', () => {
  const o = { apartmentId: 1, campo: 'arrival' as const, desde: '2026-09-30', hasta: '2026-09-30' }
  assert.equal(estanciasFiables({ page_count: 2, bookings: [] }, o), null)
  assert.equal(estanciasFiables({ error: 'x' }, o), null)
  assert.deepEqual(estanciasFiables({ page_count: 1, bookings: [] }, o), [])
})
