import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mapearScreener, mapearFundamentales, mapearQuote, candidatoDeQuote, volAnualDeBeta, proximaFechaEarnings } from './fmp.ts'

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

test('mapearQuote toma los campos libres de /stable/quote', () => {
  const q = mapearQuote({
    symbol: 'AAPL', price: 200, volume: 1000, marketCap: 3e12,
    priceAvg50: 190, priceAvg200: 180, yearHigh: 260, yearLow: 160,
  })
  assert.equal(q?.precio, 200)
  assert.equal(q?.avg50, 190)
  assert.equal(q?.yearLow, 160)
  assert.equal(mapearQuote(undefined), null)
  assert.equal(mapearQuote({ symbol: 'X' }), null)   // sin precio
})

test('candidatoDeQuote deriva posRango52 y tendencia (señales libres)', () => {
  const q = mapearQuote({ symbol: 'AAPL', price: 180, priceAvg50: 190, priceAvg200: 200, yearHigh: 260, yearLow: 160 })!
  const c = candidatoDeQuote('AAPL', q, 'Technology')
  assert.equal(c.simbolo, 'AAPL')
  assert.equal(c.posRango52, 0.2)          // (180-160)/(260-160)
  assert.equal(c.tendencia, 'bajista')     // precio<50<200
  assert.deepEqual(c.fuentes, ['fmp:quote'])
})

test('mapearFundamentales toma PER/PB (varios alias) y el DCF como valor razonable', () => {
  const f = mapearFundamentales(
    { priceToEarningsRatioTTM: 12, priceToBookRatioTTM: 2.1, netProfitMarginTTM: 0.18 } as any,
    { dcf: 300 } as any,
  )
  assert.equal(f.per, 12)
  assert.equal(f.pb, 2.1)
  assert.equal(f.valorRazonable, 300)
})

test('mapearFundamentales tolera datos ausentes', () => {
  assert.deepEqual(mapearFundamentales(undefined, undefined), {})
})

test('proximaFechaEarnings toma la próxima fecha >= hoy', () => {
  const rows = [{ date: '2026-05-01' }, { date: '2026-07-25' }, { date: '2026-10-30' }]
  assert.equal(proximaFechaEarnings(rows as any, '2026-07-18'), '2026-07-25')
  assert.equal(proximaFechaEarnings([{ date: '2026-01-01' }] as any, '2026-07-18'), undefined)  // todas pasadas
  assert.equal(proximaFechaEarnings(undefined, '2026-07-18'), undefined)
})
