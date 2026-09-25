import test from 'node:test'
import assert from 'node:assert/strict'
import { fechaEfectoInicial, fechaEfectoPorDefecto } from './fecha-efecto-inicial.ts'

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

test('vencimiento fiable dentro de la ventana → se emite con la MISMA fecha (Pablo Guzmán, 29/09)', () => {
  assert.equal(fechaEfectoPorDefecto('2026-09-29', '2026-09-25', '2026-09-26'), '2026-09-29')
  assert.equal(fechaEfectoPorDefecto('2026-09-29T00:00:00.000Z', '2026-09-25', '2026-09-26'), '2026-09-29')
})

test('vencimiento hoy vale (sin hueco); ya pasado, lejano o sin fiabilidad → mañana', () => {
  assert.equal(fechaEfectoPorDefecto('2026-09-25', '2026-09-25', '2026-09-26'), '2026-09-25')
  assert.equal(fechaEfectoPorDefecto('2026-09-24', '2026-09-25', '2026-09-26'), '2026-09-26')
  assert.equal(fechaEfectoPorDefecto('2027-01-15', '2026-09-25', '2026-09-26'), '2026-09-26')
  assert.equal(fechaEfectoPorDefecto(null, '2026-09-25', '2026-09-26'), '2026-09-26')
})
