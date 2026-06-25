// Tests de la lógica PURA FEFO. Runner de Node: `node --test test/*.test.ts`.

import { test } from 'node:test'
import assert from 'node:assert/strict'

import { clasificarCaducidades } from '../src/lib/recepcion-caducidades.ts'

const HOY = '2026-06-25'
const filas = [
  { producto: 'A', caducidad: '2026-06-20' }, // caducado
  { producto: 'B', caducidad: '2026-06-26' }, // por caducar (≤3d)
  { producto: 'C', caducidad: '2026-07-30' }, // ok (fuera de umbral)
  { producto: 'D', caducidad: null },          // sin fecha → ignorado
  { producto: 'E', caducidad: '2026-06-25' }, // hoy → por caducar
]

test('separa caducados y por caducar', () => {
  const r = clasificarCaducidades(filas, HOY, 3)
  assert.deepEqual(r.caducados.map(x => x.producto), ['A'])
  assert.deepEqual(r.porCaducar.map(x => x.producto), ['E', 'B'])
  assert.equal(r.total, 3)
})

test('ordena caducados por fecha ascendente', () => {
  const r = clasificarCaducidades([
    { producto: 'X', caducidad: '2026-06-22' },
    { producto: 'Y', caducidad: '2026-06-10' },
  ], HOY, 3)
  assert.deepEqual(r.caducados.map(x => x.producto), ['Y', 'X'])
})

test('umbral 0 deja porCaducar solo con la fecha de hoy', () => {
  const r = clasificarCaducidades(filas, HOY, 0)
  assert.deepEqual(r.porCaducar.map(x => x.producto), ['E'])
})
