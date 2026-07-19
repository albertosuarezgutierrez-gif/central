import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fechasSnapshot, precioEn, retornoForward } from './backtest-puro.ts'
import { recortarFactsHasta, extraerFundamentales, type CompanyFacts } from './edgar.ts'
import { parseYahooChartPuntos } from './precios-stooq.ts'

test('fechasSnapshot: mensuales día 1, sin pasarse del margen forward', () => {
  const fechas = fechasSnapshot('2026-07-19', 24, 98)
  assert.equal(fechas[0], '2024-07-01')
  assert.ok(fechas.every(f => f.endsWith('-01')))
  // la última debe dejar ≥98 días de forward: 2026-07-19 − 98d ≈ 2026-04-12 → última = 2026-04-01
  assert.equal(fechas.at(-1), '2026-04-01')
  assert.equal(fechas.length, 22)
})

test('precioEn: último cierre <= fecha (snapshot en festivo usa el cierre anterior)', () => {
  const puntos = [
    { fecha: '2025-01-30', cierre: 10 },
    { fecha: '2025-01-31', cierre: 11 },
    { fecha: '2025-02-03', cierre: 12 },
  ]
  assert.equal(precioEn(puntos, '2025-02-01'), 11)   // sábado → viernes 31
  assert.equal(precioEn(puntos, '2025-02-03'), 12)
  assert.equal(precioEn(puntos, '2025-01-29'), null) // antes de la serie
})

test('retornoForward: primer cierre >= fecha+dias; null si la serie no llega', () => {
  const puntos = [
    { fecha: '2025-01-01', cierre: 100 },
    { fecha: '2025-01-29', cierre: 110 },
    { fecha: '2025-02-05', cierre: 120 },
  ]
  assert.equal(retornoForward(puntos, '2025-01-01', 28), 0.10000000000000009)
  assert.equal(retornoForward(puntos, '2025-01-01', 91), null)   // no hay datos tan lejos
  assert.equal(retornoForward(puntos, '2024-12-01', 28), null)   // sin precio base
})

test('recortarFactsHasta: excluye lo publicado DESPUÉS de la fecha (sin look-ahead)', () => {
  const cf: CompanyFacts = {
    facts: {
      'us-gaap': {
        NetIncomeLoss: { units: { USD: [
          { end: '2023-12-31', val: 100, fy: 2023, fp: 'FY', form: '10-K', filed: '2024-02-15' },
          { end: '2024-12-31', val: 200, fy: 2024, fp: 'FY', form: '10-K', filed: '2025-02-15' },
        ] } },
        Assets: { units: { USD: [
          { end: '2023-12-31', val: 1000, fy: 2023, fp: 'FY', form: '10-K', filed: '2024-02-15' },
          { end: '2024-12-31', val: 2000, fy: 2024, fp: 'FY', form: '10-K', filed: '2025-02-15' },
        ] } },
      },
    },
  }
  // El 1/6/2024 solo se conocía el FY2023 (el 10-K de 2024 se publicó en feb-2025).
  const f = extraerFundamentales(recortarFactsHasta(cf, '2024-06-01'), 'X')
  assert.equal(f?.anios[0]?.fy, 2023)
  assert.equal(f?.anios.length, 1)
  // El 1/3/2025 ya se conocían los dos.
  const f2 = extraerFundamentales(recortarFactsHasta(cf, '2025-03-01'), 'X')
  assert.equal(f2?.anios[0]?.fy, 2024)
  assert.equal(f2?.anios.length, 2)
  // Filtro de conceptos: pedir solo Assets deja fuera NetIncomeLoss → sin ancla → null.
  const soloAssets = recortarFactsHasta(cf, '2025-03-01', new Set(['Assets']))
  assert.equal(extraerFundamentales(soloAssets, 'X'), null)
})

test('parseYahooChartPuntos: alinea timestamps con cierres saltando nulos', () => {
  const json = { chart: { result: [{
    timestamp: [1735689600, 1735776000, 1735862400],   // 2025-01-01/02/03 UTC
    indicators: { quote: [{ close: [100, null, 102] }] },
  }] } }
  assert.deepEqual(parseYahooChartPuntos(json), [
    { fecha: '2025-01-01', cierre: 100 },
    { fecha: '2025-01-03', cierre: 102 },
  ])
})
