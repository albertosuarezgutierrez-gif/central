import { test } from 'node:test'
import assert from 'node:assert/strict'
import { aEuros, totalEnEuros, parsearTiposBCE } from './tipos-cambio.ts'

const tipos = { fecha: '2026-10-27', rates: { USD: 1.25, GBP: 0.8 } }

test('aEuros: EUR directo, USD convertido (importe / rate)', () => {
  assert.equal(aEuros(100, 'EUR', tipos), 100)
  assert.equal(aEuros(100, 'EUR', null), 100)
  assert.equal(aEuros(125, 'USD', tipos), 100)
  assert.equal(aEuros(80, 'gbp', tipos), 100)
})

test('aEuros: sin tipo o tipos null → null, nunca 0', () => {
  assert.equal(aEuros(100, 'JPY', tipos), null)
  assert.equal(aEuros(100, 'USD', null), null)
  assert.equal(aEuros(null, 'EUR', tipos), null)
})

test('totalEnEuros: suma convertida, mínimo y fecha', () => {
  const t = totalEnEuros([{ divisa: 'EUR', valor: 50, completo: true }, { divisa: 'USD', valor: 125, completo: true }], tipos)
  assert.deepEqual(t, { total: 150, minimo: false, fecha: '2026-10-27' })
  const m = totalEnEuros([{ divisa: 'USD', valor: 125, completo: false }], tipos)
  assert.equal(m?.minimo, true)
})

test('totalEnEuros: divisa sin tipo, tipos null o valor null → null', () => {
  assert.equal(totalEnEuros([{ divisa: 'EUR', valor: 50, completo: true }, { divisa: 'JPY', valor: 9, completo: true }], tipos), null)
  assert.equal(totalEnEuros([{ divisa: 'EUR', valor: 50, completo: true }, { divisa: 'USD', valor: 9, completo: true }], null), null)
  assert.equal(totalEnEuros([{ divisa: 'EUR', valor: null, completo: false }], tipos), null)
})

test('parsearTiposBCE: respuesta válida y basura', () => {
  assert.deepEqual(parsearTiposBCE({ base: 'EUR', date: '2026-10-27', rates: { USD: 1.1, XXX: 0 } }), { fecha: '2026-10-27', rates: { USD: 1.1 } })
  assert.equal(parsearTiposBCE({}), null)
  assert.equal(parsearTiposBCE(null), null)
})
