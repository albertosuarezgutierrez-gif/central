import test from 'node:test'
import assert from 'node:assert/strict'
import { fechaEfectoInicial } from './fecha-efecto-inicial.ts'

const HOY = '2026-09-13'
const DEF = '2026-09-14'

test('una fecha guardada ya pasada NO pisa el default (proyecto 40685666)', () => {
  assert.equal(fechaEfectoInicial('2026-09-12', HOY, DEF), DEF)
})

test('una fecha guardada vigente se conserva (hoy, mañana, hoy+90)', () => {
  assert.equal(fechaEfectoInicial('2026-09-13', HOY, DEF), '2026-09-13')
  assert.equal(fechaEfectoInicial('2026-10-01', HOY, DEF), '2026-10-01')
  assert.equal(fechaEfectoInicial('2026-12-12', HOY, DEF), '2026-12-12')
})

test('más allá de 90 días vista vuelve al default', () => {
  assert.equal(fechaEfectoInicial('2026-12-13', HOY, DEF), DEF)
})

test('sin fecha guardada o con forma rara → default', () => {
  assert.equal(fechaEfectoInicial(undefined, HOY, DEF), DEF)
  assert.equal(fechaEfectoInicial('12/09/2026', HOY, DEF), DEF)
})
