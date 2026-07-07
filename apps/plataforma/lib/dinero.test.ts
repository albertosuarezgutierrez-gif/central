import { test } from 'node:test'
import assert from 'node:assert/strict'
import { eur } from './dinero.ts'

test('formato español: miles con punto, decimales con coma, € detrás', () => {
  assert.equal(eur(2162.49), '2.162,49€')
  assert.equal(eur(2000.12), '2.000,12€')
  assert.equal(eur(772.86), '772,86€')
  assert.equal(eur(8), '8,00€')
  assert.equal(eur(0), '0,00€')
  assert.equal(eur(1234567.5), '1.234.567,50€')
})

test('valores no finitos → 0,00€', () => {
  assert.equal(eur(NaN), '0,00€')
  assert.equal(eur(Infinity), '0,00€')
})
