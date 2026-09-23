import { test } from 'node:test'
import assert from 'node:assert/strict'
import { limitesDeCarnets, motorDeVersion, choqueCarnetVersion } from './carnet-moto.ts'

// Forma del catálogo según la referencia y el snapshot del portal (A1 medido).
const CARNETS = [
  { id: 'AM', minAge: 15, maxDisplacement: 50 },
  { id: 'A1', minAge: 16, maxDisplacement: 125, maxEnginePower: 11 },
  { id: 'A2', minAge: 18, maxEnginePower: 35 },
  { id: 'A', minAge: 20 },
  { name: 'sin id', maxDisplacement: 10 },
]

test('limitesDeCarnets: cc y kW por tipo; sin límite = null; entradas sin id fuera', () => {
  assert.deepEqual(limitesDeCarnets(CARNETS), [
    { id: 'AM', maxCc: 50, maxKw: null },
    { id: 'A1', maxCc: 125, maxKw: 11 },
    { id: 'A2', maxCc: null, maxKw: 35 },
    { id: 'A', maxCc: null, maxKw: null },
  ])
  assert.deepEqual(limitesDeCarnets({ items: [{ id: 'A1', maxDisplacement: '125' }] }), [
    { id: 'A1', maxCc: 125, maxKw: null },
  ])
})

test('motorDeVersion: engine.displacement y engine.powerKw de la versión con ese código', () => {
  const versiones = [
    { id: '111', engine: { displacement: 125, powerKw: 11 } },
    { id: '222', engine: { displacement: 689, powerKw: 54, powerCv: 73 } },
  ]
  assert.deepEqual(motorDeVersion(versiones, '222'), { cc: 689, kw: 54 })
  assert.equal(motorDeVersion(versiones, '999'), null, 'código que no está = no se ha podido mirar')
  // Sin kW NO se deriva de los CV: la potencia queda como «no se sabe».
  assert.deepEqual(motorDeVersion([{ id: '3', engine: { displacement: 300, powerCv: 40 } }], '3'), {
    cc: 300,
    kw: null,
  })
})

test('choqueCarnetVersion: un A1 no cubre una 689 cc / 54 kW', () => {
  const [, a1, a2, a] = limitesDeCarnets(CARNETS)
  assert.equal(
    choqueCarnetVersion(a1, { cc: 689, kw: 54 }),
    'el carné A1 no cubre esta versión: 689 cc (máximo 125 cc) y 54 kW (máximo 11 kW)',
  )
  assert.match(choqueCarnetVersion(a2, { cc: 689, kw: 54 }) ?? '', /54 kW \(máximo 35 kW\)/)
  assert.equal(choqueCarnetVersion(a, { cc: 1300, kw: 130 }), null)
  assert.equal(choqueCarnetVersion(a1, { cc: 125, kw: 11 }), null, 'el límite es inclusivo')
})

test('choqueCarnetVersion: sin dato NO hay choque (no se bloquea lo que no se ha podido mirar)', () => {
  const a1 = { id: 'A1', maxCc: 125, maxKw: 11 }
  assert.equal(choqueCarnetVersion(a1, { cc: null, kw: null }), null)
  assert.match(choqueCarnetVersion(a1, { cc: null, kw: 20 }) ?? '', /20 kW/)
})
