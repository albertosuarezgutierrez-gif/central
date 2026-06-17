import { test } from 'node:test'
import assert from 'node:assert/strict'
import { muestrasACaducar } from '../src/muestras.ts'
import type { ElaboracionTraza } from '../src/types.ts'

function elab(over: Partial<ElaboracionTraza> = {}): ElaboracionTraza {
  return { id: 'e', nombre: 'Plato', ubicaciones: [], ingredientes: [], controles: [], ...over }
}

test('muestra guardada hace 3 días (retención 2) ya puede retirarse', () => {
  const out = muestrasACaducar(
    [elab({ id: 'a', muestra_testigo: true, muestra_testigo_at: '2026-06-17T10:00:00Z' })],
    '2026-06-20T10:00:00Z',
    2,
  )
  assert.equal(out.length, 1)
  assert.equal(out[0].elaboracion_id, 'a')
  assert.equal(out[0].retirar_at, '2026-06-19T10:00:00.000Z')
})

test('muestra reciente (dentro del plazo) no aparece', () => {
  const out = muestrasACaducar(
    [elab({ muestra_testigo: true, muestra_testigo_at: '2026-06-20T08:00:00Z' })],
    '2026-06-20T10:00:00Z',
    2,
  )
  assert.equal(out.length, 0)
})

test('elaboración sin muestra guardada se ignora', () => {
  const out = muestrasACaducar(
    [elab({ muestra_testigo: false, muestra_testigo_at: '2026-06-10T10:00:00Z' })],
    '2026-06-20T10:00:00Z',
    2,
  )
  assert.equal(out.length, 0)
})

test('sin fecha de guardado se ignora', () => {
  const out = muestrasACaducar(
    [elab({ muestra_testigo: true })],
    '2026-06-20T10:00:00Z',
    2,
  )
  assert.equal(out.length, 0)
})
