import { test } from 'node:test'
import assert from 'node:assert/strict'
import { personalPorDia } from '../src/produccion.ts'

test('agrupa eventos por día, suma minutos y calcula personas (jornada 480 min)', () => {
  const r = personalPorDia(
    [
      { fecha: '2026-06-20', minutos: 300 },
      { fecha: '2026-06-20', minutos: 300 }, // mismo día → 600 → 2 personas
      { fecha: '2026-06-18', minutos: 480 }, // 1 persona
    ],
    480,
  )
  assert.deepEqual(r, [
    { fecha: '2026-06-18', minutos: 480, personas: 1 },
    { fecha: '2026-06-20', minutos: 600, personas: 2 },
  ])
})

test('sin eventos → sin días', () => {
  assert.deepEqual(personalPorDia([], 480), [])
})
