import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mapearScreener, mapearFundamentales, volAnualDeBeta } from './fmp.ts'

test('volAnualDeBeta aproxima la volatilidad por beta', () => {
  assert.equal(volAnualDeBeta(2, 0.18), 0.36)
  assert.equal(volAnualDeBeta(undefined), undefined)
})

test('mapearScreener descarta ETFs y filas sin precio, marca fuente screener', () => {
  const out = mapearScreener([
    { symbol: 'CEG', price: 251.77, sector: 'Utilities', beta: 2.3 },
    { symbol: 'SPY', price: 600, isEtf: true },        // ETF fuera
    { symbol: 'X', sector: 'Tech' },                    // sin precio fuera
  ] as any)
  assert.equal(out.length, 1)
  assert.equal(out[0].simbolo, 'CEG')
  assert.deepEqual(out[0].fuentes, ['screener'])
  assert.ok(out[0].volAnual && out[0].volAnual > 0)
})

test('mapearFundamentales toma PER/PB y el DCF como valor razonable', () => {
  const f = mapearFundamentales(
    { peRatioTTM: 12, priceToBookRatioTTM: 2.1, netProfitMarginTTM: 0.18 } as any,
    { dcf: 300 } as any,
  )
  assert.equal(f.per, 12)
  assert.equal(f.pb, 2.1)
  assert.equal(f.valorRazonable, 300)
})

test('mapearFundamentales tolera datos ausentes', () => {
  assert.deepEqual(mapearFundamentales(undefined, undefined), {})
})
