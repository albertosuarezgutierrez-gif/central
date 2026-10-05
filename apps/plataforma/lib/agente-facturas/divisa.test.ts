import test from 'node:test'
import assert from 'node:assert/strict'
import { normalizarDivisa } from './divisa.ts'

test('códigos ISO válidos, en cualquier caja y con espacios', () => {
  assert.equal(normalizarDivisa('EUR'), 'EUR')
  assert.equal(normalizarDivisa(' usd '), 'USD')
  assert.equal(normalizarDivisa('gbp'), 'GBP')
})

test('símbolos y nombres -> ISO', () => {
  assert.equal(normalizarDivisa('€'), 'EUR')
  assert.equal(normalizarDivisa('$'), 'USD')
  assert.equal(normalizarDivisa('US$'), 'USD')
  assert.equal(normalizarDivisa('£'), 'GBP')
  assert.equal(normalizarDivisa('Euros'), 'EUR')
  assert.equal(normalizarDivisa('Dólares'), 'USD')
  assert.equal(normalizarDivisa('US Dollar'), 'USD')
  assert.equal(normalizarDivisa('libras esterlinas'), 'GBP')
})

test('basura o ausencia -> null, nunca EUR por defecto', () => {
  for (const v of [undefined, null, '', '  ', 'N/A', 'null', 'ABC', 'ABC 12', 123, {}, true, 'desconocida']) {
    assert.equal(normalizarDivisa(v), null, String(v))
  }
})
