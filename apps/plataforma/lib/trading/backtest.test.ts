import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fechasSnapshot, precioEn, retornoForward, cierresPeriodicos, ultimaSma, sobreSma, MESES_RETROVISOR } from './backtest-puro.ts'
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

test('la ventana por DEFECTO es de 15 años: 178 snapshots que cruzan varios regímenes', () => {
  // El motivo del cambio (08/08/2026): con 24 meses H8 invertía el signo entre mitades y no había
  // forma de saber cuál era el mundo. Con 180 meses el corpus atraviesa 2011-2026.
  assert.equal(MESES_RETROVISOR, 180)
  const fechas = fechasSnapshot('2026-08-08')
  assert.equal(fechas[0], '2011-08-01')
  assert.equal(fechas.at(-1), '2026-05-01')   // 2026-08-08 − 98d ≈ 2026-05-02 → cabe mayo
  assert.equal(fechas.length, 178)
  assert.ok(fechas.every(f => f.endsWith('-01')))
  // Estrictamente creciente y sin huecos de mes (lo que hace comparables los subperiodos).
  for (let i = 1; i < fechas.length; i++) assert.ok(fechas[i] > fechas[i - 1])
  // Cubre de verdad los regímenes que motivaron el cambio.
  for (const hito of ['2015-08-01', '2018-12-01', '2020-03-01', '2022-06-01'])
    assert.ok(fechas.includes(hito), `falta el snapshot de ${hito}`)
})

test('fechasSnapshot: el margen forward se respeta también en la ventana larga', () => {
  // La última fecha SIEMPRE deja ≥98 días para que ret91 quepa entero: sin esto la ventana larga
  // colaría snapshots con retorno forward truncado, que es un dato inventado.
  const hoy = '2026-08-08'
  const limite = new Date(Date.parse(`${hoy}T00:00:00Z`) - 98 * 86_400_000).toISOString().slice(0, 10)
  assert.ok(fechasSnapshot(hoy).every(f => f <= limite))
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

test('cierresPeriodicos: remuestrea al último cierre de cada semana/mes y respeta `hasta`', () => {
  const puntos = [
    { fecha: '2025-01-06', cierre: 10 },  // lunes semana 1
    { fecha: '2025-01-08', cierre: 11 },  // misma semana → sustituye
    { fecha: '2025-01-13', cierre: 12 },  // semana 2
    { fecha: '2025-02-03', cierre: 13 },  // febrero
    { fecha: '2025-02-28', cierre: 14 },  // mismo mes → sustituye en 'mes'
    { fecha: '2025-03-10', cierre: 15 },  // fuera de `hasta`
  ]
  assert.deepEqual(cierresPeriodicos(puntos, '2025-02-28', 'sem'), [11, 12, 13, 14])
  assert.deepEqual(cierresPeriodicos(puntos, '2025-02-28', 'mes'), [12, 14])
})

test('ultimaSma/sobreSma: media de los n últimos; null con serie corta', () => {
  assert.equal(ultimaSma([1, 2, 3, 4], 2), 3.5)
  assert.equal(ultimaSma([1, 2], 3), null)
  assert.equal(sobreSma([1, 2, 3, 10], 3), true)   // 10 > media(2,3,10)=5
  assert.equal(sobreSma([10, 3, 2, 1], 3), false)  // 1 < media(3,2,1)=2
  assert.equal(sobreSma([1], 3), null)
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
