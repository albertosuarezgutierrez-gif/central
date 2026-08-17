import test from 'node:test'
import assert from 'node:assert/strict'
import { esCompPlausible, MIN_EUR_PLAZA_COMP } from './pricing-comps-plausibles.ts'

test('precio de habitación vestido de piso de 12 plazas se descarta', () => {
  // Casos reales del corpus de House (17/08/2026): 44€, 45€, 77€ y 104€ "para 12".
  for (const precio of [44, 45, 77, 104]) {
    assert.equal(esCompPlausible(precio, 12), false, `${precio}€/12p debería ser implausible`)
  }
})

test('el mercado real de cada aforo pasa (mínimos legítimos medidos el 17/08/2026)', () => {
  assert.equal(esCompPlausible(27, 2), true)   // busto
  assert.equal(esCompPlausible(48, 4), true)   // duplex — justo en el umbral (12€/plaza)
  assert.equal(esCompPlausible(74, 5), true)   // luxury
  assert.equal(esCompPlausible(149, 12), true) // house
})

test('borde exacto: el umbral es inclusivo', () => {
  assert.equal(esCompPlausible(MIN_EUR_PLAZA_COMP * 4, 4), true)
  assert.equal(esCompPlausible(MIN_EUR_PLAZA_COMP * 4 - 1, 4), false)
})

test('sin aforo declarado no se juzga (NULL/0 no autoriza a descartar)', () => {
  assert.equal(esCompPlausible(44, null), true)
  assert.equal(esCompPlausible(44, undefined), true)
  assert.equal(esCompPlausible(44, 0), true)
})

test('precio no positivo o no finito es implausible cuando hay aforo', () => {
  assert.equal(esCompPlausible(0, 4), false)
  assert.equal(esCompPlausible(-10, 4), false)
  assert.equal(esCompPlausible(NaN, 4), false)
})
