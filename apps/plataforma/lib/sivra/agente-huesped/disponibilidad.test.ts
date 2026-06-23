import { test } from 'node:test'
import assert from 'node:assert'
import { nocheAnteriorLibre, diaAnterior, restarDias } from './disponibilidad.ts'

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
