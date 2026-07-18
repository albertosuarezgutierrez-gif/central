import { test } from 'node:test'
import assert from 'node:assert/strict'
import { serieAnual, extraerFundamentales, mapaTickers } from './edgar.ts'
import { piotroskiFScore } from '@central/module-trading'

// Fixture mínimo con la forma real de companyfacts (2 ejercicios: FY2023 mejor que FY2022).
function unidad(puntos: Array<{ end: string; val: number; fy: number; filed: string }>) {
  return { units: { USD: puntos.map(p => ({ ...p, fp: 'FY', form: '10-K' })) } }
}
const CF = {
  cik: 320193,
  entityName: 'ACME Inc.',
  facts: {
    'us-gaap': {
      NetIncomeLoss: unidad([{ end: '2022-12-31', val: 100, fy: 2022, filed: '2023-02-01' }, { end: '2023-12-31', val: 150, fy: 2023, filed: '2024-02-01' }]),
      Assets: unidad([{ end: '2022-12-31', val: 1000, fy: 2022, filed: '2023-02-01' }, { end: '2023-12-31', val: 1100, fy: 2023, filed: '2024-02-01' }]),
      NetCashProvidedByUsedInOperatingActivities: unidad([{ end: '2022-12-31', val: 120, fy: 2022, filed: '2023-02-01' }, { end: '2023-12-31', val: 200, fy: 2023, filed: '2024-02-01' }]),
      LongTermDebtNoncurrent: unidad([{ end: '2022-12-31', val: 300, fy: 2022, filed: '2023-02-01' }, { end: '2023-12-31', val: 250, fy: 2023, filed: '2024-02-01' }]),
      AssetsCurrent: unidad([{ end: '2022-12-31', val: 400, fy: 2022, filed: '2023-02-01' }, { end: '2023-12-31', val: 500, fy: 2023, filed: '2024-02-01' }]),
      LiabilitiesCurrent: unidad([{ end: '2022-12-31', val: 200, fy: 2022, filed: '2023-02-01' }, { end: '2023-12-31', val: 200, fy: 2023, filed: '2024-02-01' }]),
      Revenues: unidad([{ end: '2022-12-31', val: 800, fy: 2022, filed: '2023-02-01' }, { end: '2023-12-31', val: 1000, fy: 2023, filed: '2024-02-01' }]),
      GrossProfit: unidad([{ end: '2022-12-31', val: 300, fy: 2022, filed: '2023-02-01' }, { end: '2023-12-31', val: 420, fy: 2023, filed: '2024-02-01' }]),
      OperatingIncomeLoss: unidad([{ end: '2023-12-31', val: 180, fy: 2023, filed: '2024-02-01' }]),
      WeightedAverageNumberOfDilutedSharesOutstanding: { units: { shares: [
        { end: '2022-12-31', val: 50, fy: 2022, fp: 'FY', form: '10-K', filed: '2023-02-01' },
        { end: '2023-12-31', val: 48, fy: 2023, fp: 'FY', form: '10-K', filed: '2024-02-01' },
      ] } },
    },
  },
}

test('serieAnual coge el valor FY de 10-K por ejercicio', () => {
  const s = serieAnual(CF.facts, 'NetIncomeLoss')
  assert.equal(s.get(2022), 100)
  assert.equal(s.get(2023), 150)
})

test('serieAnual con el filed más reciente gana ante FY repetido', () => {
  const facts = { 'us-gaap': { Assets: unidad([
    { end: '2023-12-31', val: 900, fy: 2023, filed: '2024-01-01' },
    { end: '2023-12-31', val: 1100, fy: 2023, filed: '2024-05-01' },  // reexpresión posterior
  ]) } }
  assert.equal(serieAnual(facts, 'Assets').get(2023), 1100)
})

test('extraerFundamentales devuelve 2 ejercicios en el formato del módulo + ROIC', () => {
  const f = extraerFundamentales(CF, 'ACME')!
  assert.equal(f.simbolo, 'ACME')
  assert.equal(f.cik, '0000000320193'.slice(-10))
  assert.equal(f.anios.length, 2)
  assert.equal(f.anios[0].fy, 2023)          // el más reciente primero
  assert.equal(f.anios[1].fy, 2022)
  // ROA 2023 = 150/1100 ; margen bruto = 420/1000 ; rotación = 1000/1100
  assert.ok(Math.abs(f.anios[0].fin.roa - 150 / 1100) < 1e-9)
  assert.ok(Math.abs(f.anios[0].fin.margenBruto - 0.42) < 1e-9)
  assert.equal(f.anios[0].fin.acciones, 48)
  // ROIC = EBIT(180) / (Assets 1100 − PasivoCorriente 200) = 180/900
  assert.equal(f.ebit, 180)
  assert.equal(f.capitalInvertido, 900)
  assert.ok(Math.abs(f.roic! - 180 / 900) < 1e-9)
})

test('los ejercicios extraídos encajan directos en piotroskiFScore', () => {
  const f = extraerFundamentales(CF, 'ACME')!
  const p = piotroskiFScore(f.anios[0].fin, f.anios[1].fin)
  assert.ok(p.score >= 7)                    // empresa que mejora en casi todo
  assert.equal(p.detalle.roaMejora, true)    // 150/1100 > 100/1000
  assert.equal(p.detalle.sinDilucion, true)  // 48 <= 50
})

test('extraerFundamentales sin anclas (ni beneficio ni activos) → null', () => {
  assert.equal(extraerFundamentales({ facts: { 'us-gaap': {} } }, 'X'), null)
})

test('mapaTickers construye ticker → CIK a 10 dígitos', () => {
  const m = mapaTickers({ '0': { cik_str: 320193, ticker: 'AAPL', title: 'Apple Inc.' }, '1': { cik_str: 789019, ticker: 'MSFT', title: 'Microsoft' } })
  assert.equal(m.get('AAPL'), '0000320193')
  assert.equal(m.get('MSFT'), '0000789019')
})
