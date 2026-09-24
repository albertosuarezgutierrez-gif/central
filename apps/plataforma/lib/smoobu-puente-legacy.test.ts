import { test } from 'node:test'
import assert from 'node:assert/strict'
import { debeUsarPuenteLegacy } from './smoobu-puente-legacy.ts'

const RATES = 'https://login.smoobu.com/api/rates'
const RATES_CON_QUERY = 'https://login.smoobu.com/api/rates?apartments[]=123&from=2026-09-15'
const RESERVATIONS = 'https://login.smoobu.com/api/reservations'

test('sin key legacy, nunca usa el puente (fail-safe)', () => {
  assert.equal(debeUsarPuenteLegacy('GET', RATES, false), false)
})

test('con key legacy, GET a /api/rates SÍ usa el puente', () => {
  assert.equal(debeUsarPuenteLegacy('GET', RATES, true), true)
})

test('la query string no cambia la decisión', () => {
  assert.equal(debeUsarPuenteLegacy('GET', RATES_CON_QUERY, true), true)
})

test('POST a /api/rates NO usa el puente (el puente es solo lectura)', () => {
  assert.equal(debeUsarPuenteLegacy('POST', RATES, true), false)
})

test('GET a otra ruta NO usa el puente', () => {
  assert.equal(debeUsarPuenteLegacy('GET', RESERVATIONS, true), false)
})

test('el método es insensible a mayúsculas/minúsculas', () => {
  assert.equal(debeUsarPuenteLegacy('get', RATES, true), true)
})

test('una URL malformada no revienta: se resuelve a false', () => {
  assert.equal(debeUsarPuenteLegacy('GET', 'no-es-una-url', true), false)
})
