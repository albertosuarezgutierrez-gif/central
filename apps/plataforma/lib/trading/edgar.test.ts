import { test } from 'node:test'
import assert from 'node:assert/strict'
import { serieAnual, anioFiscalDe, monedaInforme, extraerFundamentales, mapaTickers, listaUniverso, extraerEventos8K, extraerFilingsForm4, accionesPlausibles, estimarProximoInforme, capitalizacionCruzable } from './edgar.ts'
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

test('serieAnual indexa por el CIERRE del ejercicio del dato, no por el `fy` del informe', () => {
  const s = serieAnual(CF.facts, 'NetIncomeLoss')
  assert.equal(s.get('2022-12-31'), 100)
  assert.equal(s.get('2023-12-31'), 150)
})

test('serieAnual con el filed más reciente gana ante el mismo cierre repetido', () => {
  const facts = { 'us-gaap': { Assets: unidad([
    { end: '2023-12-31', val: 900, fy: 2023, filed: '2024-01-01' },
    { end: '2023-12-31', val: 1100, fy: 2023, filed: '2024-05-01' },  // reexpresión posterior
  ]) } }
  assert.equal(serieAnual(facts, 'Assets').get('2023-12-31'), 1100)
})

// ── 🚨 REGRESIÓN (31/07/2026): comparativos de un mismo informe ────────────────────────────────────
// Datos REALES de ORCL descargados de la SEC (companyconcept NetIncomeLoss/Assets, CIK 0001341439).
// El 10-K de FY2026 publica TRES ejercicios de resultado y DOS de balance, y los cinco hechos llevan
// `fy:2026, fp:FY, filed:2026-06-22`. Indexando por `fy` se colapsaban en una clave y ganaba el primero
// del array (el más viejo): el radar daba beneficio de FY2024 (10.467 M$) etiquetado como FY2026 y lo
// dividía entre los activos de FY2025 (168.361 M$) para el ROA.
const ORCL_10K_FY2026 = {
  cik: 1341439,
  facts: {
    'us-gaap': {
      NetIncomeLoss: { units: { USD: [
        { start: '2023-06-01', end: '2024-05-31', val: 10_467e6, fy: 2026, fp: 'FY', form: '10-K', filed: '2026-06-22' },
        { start: '2024-06-01', end: '2025-05-31', val: 12_443e6, fy: 2026, fp: 'FY', form: '10-K', filed: '2026-06-22' },
        { start: '2025-06-01', end: '2026-05-31', val: 17_087e6, fy: 2026, fp: 'FY', form: '10-K', filed: '2026-06-22' },
      ] } },
      Assets: { units: { USD: [
        { end: '2025-05-31', val: 168_361e6, fy: 2026, fp: 'FY', form: '10-K', filed: '2026-06-22' },
        { end: '2026-05-31', val: 261_759e6, fy: 2026, fp: 'FY', form: '10-K', filed: '2026-06-22' },
      ] } },
    },
  },
}

test('serieAnual separa los ejercicios comparativos que comparten `fy` y `filed` (caso ORCL)', () => {
  const s = serieAnual(ORCL_10K_FY2026.facts, 'NetIncomeLoss')
  assert.equal(s.size, 3, 'los tres comparativos son ejercicios distintos, no uno')
  assert.equal(s.get('2026-05-31'), 17_087e6)
  assert.equal(s.get('2025-05-31'), 12_443e6)
  assert.equal(s.get('2024-05-31'), 10_467e6)
})

test('extraerFundamentales coge el ejercicio VIVO y no mezcla años en un mismo ratio (caso ORCL)', () => {
  const f = extraerFundamentales(ORCL_10K_FY2026, 'ORCL')!
  assert.equal(f.anios[0].periodo, '2026-05-31')
  assert.equal(f.anios[0].fy, 2026)
  assert.equal(f.anios[0].fin.beneficioNeto, 17_087e6)   // antes: 10.467 M$, el de FY2024
  assert.equal(f.anios[1].periodo, '2025-05-31')
  assert.equal(f.anios[1].fin.beneficioNeto, 12_443e6)
  // ROA del ejercicio vivo con los activos DE ESE MISMO ejercicio (antes: FY2024 ÷ activos FY2025).
  assert.ok(Math.abs(f.anios[0].fin.roa - 17_087 / 261_759) < 1e-9)
})

test('serieAnual descarta las columnas trimestrales que un 10-K publica con `fp:FY`', () => {
  const facts = { 'us-gaap': { NetIncomeLoss: { units: { USD: [
    { start: '2025-06-01', end: '2026-05-31', val: 1000, fy: 2026, fp: 'FY', form: '10-K', filed: '2026-06-22' },
    { start: '2026-03-01', end: '2026-05-31', val: 250, fy: 2026, fp: 'FY', form: '10-K', filed: '2026-06-22' },  // Q4
  ] } } } }
  const s = serieAnual(facts, 'NetIncomeLoss')
  assert.equal(s.size, 1)
  assert.equal(s.get('2026-05-31'), 1000, 'el trimestre no puede pisar al ejercicio completo')
})

test('anioFiscalDe etiqueta el cierre: enero temprano = ejercicio anterior; 31/01 = su año natural', () => {
  assert.equal(anioFiscalDe('2026-05-31'), 2026)
  assert.equal(anioFiscalDe('2025-12-31'), 2025)
  assert.equal(anioFiscalDe('2026-01-03'), 2025)   // calendario 52/53 semanas
  assert.equal(anioFiscalDe('2026-01-31'), 2026)   // minorista tipo Walmart (su propio FY2026)
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

// Fixture de un emisor EXTRANJERO: 20-F en taxonomía `ifrs-full` con los nombres de concepto IFRS
// (ProfitLoss/Revenue/CurrentAssets…). Antes del soporte IFRS esto devolvía null (SPOT/ASML/NVO…).
function unidadIfrs(puntos: Array<{ end: string; val: number; fy: number; filed: string }>) {
  return { units: { USD: puntos.map(p => ({ ...p, fp: 'FY', form: '20-F' })) } }
}
const CF_IFRS = {
  cik: 1639920,
  entityName: 'Foreign Tech S.A.',
  facts: {
    'ifrs-full': {
      ProfitLoss: unidadIfrs([{ end: '2022-12-31', val: 100, fy: 2022, filed: '2023-03-01' }, { end: '2023-12-31', val: 150, fy: 2023, filed: '2024-03-01' }]),
      Assets: unidadIfrs([{ end: '2022-12-31', val: 1000, fy: 2022, filed: '2023-03-01' }, { end: '2023-12-31', val: 1100, fy: 2023, filed: '2024-03-01' }]),
      CashFlowsFromUsedInOperatingActivities: unidadIfrs([{ end: '2022-12-31', val: 120, fy: 2022, filed: '2023-03-01' }, { end: '2023-12-31', val: 200, fy: 2023, filed: '2024-03-01' }]),
      NoncurrentPortionOfNoncurrentBorrowings: unidadIfrs([{ end: '2022-12-31', val: 300, fy: 2022, filed: '2023-03-01' }, { end: '2023-12-31', val: 250, fy: 2023, filed: '2024-03-01' }]),
      CurrentAssets: unidadIfrs([{ end: '2022-12-31', val: 400, fy: 2022, filed: '2023-03-01' }, { end: '2023-12-31', val: 500, fy: 2023, filed: '2024-03-01' }]),
      CurrentLiabilities: unidadIfrs([{ end: '2022-12-31', val: 200, fy: 2022, filed: '2023-03-01' }, { end: '2023-12-31', val: 200, fy: 2023, filed: '2024-03-01' }]),
      Revenue: unidadIfrs([{ end: '2022-12-31', val: 800, fy: 2022, filed: '2023-03-01' }, { end: '2023-12-31', val: 1000, fy: 2023, filed: '2024-03-01' }]),
      GrossProfit: unidadIfrs([{ end: '2022-12-31', val: 300, fy: 2022, filed: '2023-03-01' }, { end: '2023-12-31', val: 420, fy: 2023, filed: '2024-03-01' }]),
      ProfitLossFromOperatingActivities: unidadIfrs([{ end: '2023-12-31', val: 180, fy: 2023, filed: '2024-03-01' }]),
      WeightedAverageShares: { units: { shares: [
        { end: '2022-12-31', val: 50, fy: 2022, fp: 'FY', form: '20-F', filed: '2023-03-01' },
        { end: '2023-12-31', val: 48, fy: 2023, fp: 'FY', form: '20-F', filed: '2024-03-01' },
      ] } },
    },
  },
}

test('extraerFundamentales lee un 20-F/IFRS (antes devolvía null)', () => {
  const f = extraerFundamentales(CF_IFRS, 'SPOT')!
  assert.ok(f, 'debe extraer un emisor IFRS')
  assert.equal(f.anios.length, 2)
  assert.equal(f.anios[0].fy, 2023)
  assert.ok(Math.abs(f.anios[0].fin.roa - 150 / 1100) < 1e-9)     // ProfitLoss/Assets
  assert.ok(Math.abs(f.anios[0].fin.margenBruto - 0.42) < 1e-9)  // GrossProfit/Revenue
  assert.equal(f.anios[0].fin.acciones, 48)                       // WeightedAverageShares
  assert.equal(f.ebit, 180)                                       // ProfitLossFromOperatingActivities
  assert.equal(f.capitalInvertido, 900)                          // Assets − CurrentLiabilities
  assert.ok(Math.abs(f.roic! - 180 / 900) < 1e-9)
  // Y encaja en el F-score igual que un 10-K
  const p = piotroskiFScore(f.anios[0].fin, f.anios[1].fin)
  assert.ok(p.score >= 7)
})

test('extraerFundamentales sin anclas (ni beneficio ni activos) → null', () => {
  assert.equal(extraerFundamentales({ facts: { 'us-gaap': {} } }, 'X'), null)
})

test('mapaTickers construye ticker → CIK a 10 dígitos', () => {
  const m = mapaTickers({ '0': { cik_str: 320193, ticker: 'AAPL', title: 'Apple Inc.' }, '1': { cik_str: 789019, ticker: 'MSFT', title: 'Microsoft' } })
  assert.equal(m.get('AAPL'), '0000320193')
  assert.equal(m.get('MSFT'), '0000789019')
})

test('listaUniverso: ticker+nombre+cik en orden del fichero, dedupe por CIK, filtra clases raras', () => {
  const json = {
    '0': { cik_str: 789019, ticker: 'MSFT', title: 'Microsoft Corp' },
    '1': { cik_str: 320193, ticker: 'AAPL', title: 'Apple Inc.' },
    '2': { cik_str: 789019, ticker: 'MSFT-W', title: 'Microsoft Corp WT' },  // clase rara + CIK repetido
    '3': { cik_str: 1067983, ticker: 'BRK.B', title: 'Berkshire Hathaway' }, // punto de clase: se admite
  }
  const l = listaUniverso(json, 10)
  assert.deepEqual(l.map(x => x.simbolo), ['MSFT', 'AAPL', 'BRK.B'])
  assert.equal(l[0].nombre, 'Microsoft Corp')
  assert.equal(l[0].cik, '0000789019')
  assert.deepEqual(listaUniverso(json, 2).map(x => x.simbolo), ['MSFT', 'AAPL'])  // respeta n
})

// Fixture para los fundamentales ampliados: el CF de arriba + caja (CashAndCashEquivalents).
// El original ya trae LongTermDebtNoncurrent, Revenues, NetIncomeLoss y acciones — NO se toca.
const CF_CON_CAJA = structuredClone(CF)
;(CF_CON_CAJA.facts['us-gaap'] as Record<string, unknown>).CashAndCashEquivalentsAtCarryingValue = unidad([
  { end: '2022-12-31', val: 90, fy: 2022, filed: '2023-02-01' },
  { end: '2023-12-31', val: 110, fy: 2023, filed: '2024-02-01' },
])

test('extraerFundamentales expone deudaLp/caja/margenNeto/acciones para EV y mktCap', () => {
  const f = extraerFundamentales(CF_CON_CAJA, 'TST')!
  assert.equal(typeof f.deudaLp, 'number')
  assert.equal(typeof f.caja, 'number')
  assert.equal(typeof f.margenNeto, 'number')
  assert.ok((f.acciones ?? 0) > 0)
  // Valores exactos del FY más reciente (2023): deudaLp 250 · caja 110 · margen 150/1000 · acciones 48
  assert.equal(f.deudaLp, 250)
  assert.equal(f.caja, 110)
  assert.ok(Math.abs(f.margenNeto! - 0.15) < 1e-9)
  assert.equal(f.acciones, 48)
})

// ── 📰 extraerEventos8K (capa informativa del digest) ────────────────────────────────────────────
const SUBS = {
  filings: {
    recent: {
      form: ['8-K', '10-Q', '8-K', '8-K', '8-K/A'],
      filingDate: ['2026-07-18', '2026-07-17', '2026-07-16', '2026-07-01', '2026-07-15'],
      items: ['1.01,9.01', '', '2.02,9.01', '2.01', '5.02'],
    },
  },
}

test('extraerEventos8K coge solo 8-K recientes con items relevantes', () => {
  const evs = extraerEventos8K(SUBS, '2026-07-13')
  // 18/07 (1.01) y 15/07 (5.02, el 8-K/A también vale); fuera: el 10-Q, el 2.02 rutinario y el 2.01 viejo
  assert.equal(evs.length, 2)
  assert.deepEqual(evs[0], { fecha: '2026-07-18', items: ['1.01'], etiquetas: ['acuerdo material'] })
  assert.deepEqual(evs[1].items, ['5.02'])
})

test('extraerEventos8K descarta los items rutinarios aunque el 8-K sea reciente', () => {
  assert.equal(extraerEventos8K(SUBS, '2026-07-13').some(e => e.items.includes('2.02') || e.items.includes('9.01')), false)
})

test('extraerEventos8K tolera JSON malformado o vacío', () => {
  assert.deepEqual(extraerEventos8K(null, '2026-07-01'), [])
  assert.deepEqual(extraerEventos8K({}, '2026-07-01'), [])
  assert.deepEqual(extraerEventos8K({ filings: { recent: { form: 'no-array' } } }, '2026-07-01'), [])
})

// ── 🧑‍💼 extraerFilingsForm4 (insiders del digest) ────────────────────────────────────────────────
const SUBS_F4 = {
  filings: {
    recent: {
      form: ['4', '10-Q', '4/A', '4', '4'],
      filingDate: ['2026-07-18', '2026-07-17', '2026-07-16', '2026-07-01', '2026-07-15'],
      accessionNumber: ['0000320193-26-000077', '0000320193-26-000078', '0000320193-26-000079', '0000320193-26-000080', 'rota'],
    },
  },
}

test('extraerFilingsForm4 coge los Form 4 recientes con accession válido (sin guiones)', () => {
  const fs = extraerFilingsForm4(SUBS_F4, '2026-07-13')
  // 18/07 y el 4/A del 16/07; fuera: el 10-Q, el del 01/07 (viejo) y el accession roto del 15/07
  assert.equal(fs.length, 2)
  assert.deepEqual(fs[0], { fecha: '2026-07-18', accesion: '000032019326000077' })
  assert.equal(fs[1].accesion, '000032019326000079')
})

test('extraerFilingsForm4 tolera JSON malformado o vacío', () => {
  assert.deepEqual(extraerFilingsForm4(null, '2026-07-01'), [])
  assert.deepEqual(extraerFilingsForm4({}, '2026-07-01'), [])
})

test('estimarProximoInforme proyecta el 10-Q del año pasado a la ventana próxima', () => {
  const subs = {
    filings: {
      recent: {
        form: ['10-Q', '8-K', '10-K', '10-Q'],
        filingDate: ['2025-07-25', '2025-07-25', '2025-02-20', '2025-04-28'],
      },
    },
  }
  // 2025-07-25 + 365 = 2026-07-25 → dentro de [hoy, hoy+10]; el 10-K de febrero y el Q de abril, fuera.
  assert.equal(estimarProximoInforme(subs, '2026-07-20'), '2026-07-25')
  assert.equal(estimarProximoInforme(subs, '2026-08-10'), null)   // ya pasó la ventana
  assert.equal(estimarProximoInforme(null, '2026-07-20'), null)   // JSON roto
})

// ── 💱 Divisa del informe ──────────────────────────────────────────────────────────────────────────
// Los importes se cruzan con una capitalización en DÓLARES, así que mezclar divisas fabrica múltiplos
// de la nada: en producción TLK (rupias) daba un FCF yield del 2.679% y AMX (pesos) un earnings yield
// del 9,14% que parecía normal. BABA y PDD publican los mismos conceptos en USD y en CNY.
function unidadEn(divisa: string, puntos: Array<{ end: string; val: number; fy: number; filed: string }>) {
  return { units: { [divisa]: puntos.map(p => ({ ...p, fp: 'FY', form: '20-F' })) } }
}
const CF_YENES = {
  cik: 1094517,
  facts: {
    'ifrs-full': {
      ProfitLoss: unidadEn('JPY', [{ end: '2024-03-31', val: 4_944_933e6, fy: 2025, filed: '2025-06-25' }, { end: '2025-03-31', val: 4_765_086e6, fy: 2025, filed: '2025-06-25' }]),
      Assets: unidadEn('JPY', [{ end: '2024-03-31', val: 90_114_296e6, fy: 2025, filed: '2025-06-25' }, { end: '2025-03-31', val: 93_601_350e6, fy: 2025, filed: '2025-06-25' }]),
      LongtermBorrowings: unidadEn('JPY', [{ end: '2025-03-31', val: 22_963_400e6, fy: 2025, filed: '2025-06-25' }]),
    },
  },
}

test('monedaInforme prefiere USD cuando el emisor publica en las dos divisas', () => {
  const facts = { 'us-gaap': { Assets: { units: {
    CNY: [{ end: '2026-03-31', val: 1800, fy: 2026, fp: 'FY', form: '20-F', filed: '2026-06-01' }],
    USD: [{ end: '2026-03-31', val: 250, fy: 2026, fp: 'FY', form: '20-F', filed: '2026-06-01' }],
  } } } }
  assert.equal(monedaInforme(facts, ['Assets']), 'USD')
  assert.equal(serieAnual(facts, 'Assets', 'USD').get('2026-03-31'), 250)
})

test('monedaInforme NO se ancla a una traducción de conveniencia vieja en dólares (caso TM)', () => {
  // Toyota arrastra un `Assets` en USD de 2013 junto a sus cuentas vivas en yenes. Preferir el dólar
  // por preferencia dejaba la empresa clavada en un ejercicio de hace trece años.
  const facts = { 'ifrs-full': { Assets: { units: {
    USD: [{ end: '2013-03-31', val: 300e9, fy: 2013, fp: 'FY', form: '20-F', filed: '2013-06-24' }],
    JPY: [{ end: '2025-03-31', val: 93_601_350e6, fy: 2025, fp: 'FY', form: '20-F', filed: '2025-06-25' }],
  } } } }
  assert.equal(monedaInforme(facts, ['Assets']), 'JPY')
})

test('monedaInforme cae a la moneda local si el emisor no publica en USD, y no mezcla', () => {
  assert.equal(monedaInforme(CF_YENES.facts, ['Assets']), 'JPY')
  const f = extraerFundamentales(CF_YENES, 'TM')!
  assert.equal(f.moneda, 'JPY')
  assert.equal(f.deudaLp, 22_963_400e6)                      // en yenes, coherente con el resto
  assert.equal(f.anios[0].periodo, '2025-03-31')
  assert.ok(Math.abs(f.anios[0].fin.roa - 4_765_086 / 93_601_350) < 1e-9)   // ratio interno: válido
})

test('monedaInforme ignora las unidades que no son dinero', () => {
  const facts = { 'us-gaap': { CommonStockSharesOutstanding: { units: {
    shares: [{ end: '2025-12-31', val: 1e9, fy: 2025, fp: 'FY', form: '10-K', filed: '2026-02-01' }],
  } } } }
  assert.equal(monedaInforme(facts, ['CommonStockSharesOutstanding']), undefined)
})

// ── 📊 Margen bruto derivado y alias de deuda ──────────────────────────────────────────────────────
test('margen bruto: se deriva de ventas − coste de ventas cuando no hay GrossProfit etiquetado', () => {
  // Forma de GOOGL/AMZN/META/WMT/LLY: publican el coste, no el margen.
  const cf = structuredClone(CF)
  delete (cf.facts['us-gaap'] as Record<string, unknown>).GrossProfit
  ;(cf.facts['us-gaap'] as Record<string, unknown>).CostOfRevenue = unidad([
    { end: '2022-12-31', val: 500, fy: 2022, filed: '2023-02-01' },
    { end: '2023-12-31', val: 580, fy: 2023, filed: '2024-02-01' },
  ])
  const f = extraerFundamentales(cf, 'X')!
  assert.ok(Math.abs(f.anios[0].fin.margenBruto - (1000 - 580) / 1000) < 1e-9)  // 42%, igual que etiquetado
  assert.ok(Math.abs(f.anios[1].fin.margenBruto - (800 - 500) / 800) < 1e-9)    // 37,5%
  // Y con el margen ya calculable, la señal del F-score deja de ser falsa por omisión.
  assert.equal(piotroskiFScore(f.anios[0].fin, f.anios[1].fin).detalle.mejorMargenBruto, true)
})

test('margen bruto queda a 0 solo si NO hay ni GrossProfit ni coste de ventas', () => {
  const cf = structuredClone(CF)
  delete (cf.facts['us-gaap'] as Record<string, unknown>).GrossProfit
  assert.equal(extraerFundamentales(cf, 'X')!.anios[0].fin.margenBruto, 0)
})

test('deudaLp resuelve los conceptos que usan de verdad AVGO y JPM', () => {
  const conAlias = (concepto: string, val: number) => {
    const cf = structuredClone(CF)
    delete (cf.facts['us-gaap'] as Record<string, unknown>).LongTermDebtNoncurrent
    ;(cf.facts['us-gaap'] as Record<string, unknown>)[concepto] = unidad([{ end: '2023-12-31', val, fy: 2023, filed: '2024-02-01' }])
    return extraerFundamentales(cf, 'X')!.deudaLp
  }
  assert.equal(conAlias('LongTermDebtAndCapitalLeaseObligations', 620), 620)                    // AVGO
  assert.equal(conAlias('LongTermDebtAndCapitalLeaseObligationsIncludingCurrentMaturities', 4352), 4352)  // JPM
  assert.equal(conAlias('DebtLongtermAndShorttermCombinedAmount', 425), 425)                    // LLY/MA
})

test('accionesPlausibles descarta cifras de acciones sin escalar (caso MCD: 712 en vez de 712M)', () => {
  assert.equal(accionesPlausibles(712), null)          // XBRL sin escalar → basura
  assert.equal(accionesPlausibles(712_000_000), 712_000_000)
  assert.equal(accionesPlausibles(null), null)
  assert.equal(accionesPlausibles(NaN), null)
})

test('accionesPlausibles descarta también la escala inflada del emisor (caso NMR: 3,07 mil billones)', () => {
  // Nomura publica su recuento real (3.066.458.811) multiplicado por 1e6. Con el ADR ya bloqueado no
  // hace daño hoy, pero el dato es basura y no debe propagarse.
  assert.equal(accionesPlausibles(3_066_458_811_000_000), null)
  // Y NO puede cazar a las que sí tienen muchísimas acciones de verdad.
  assert.equal(accionesPlausibles(604_437_877_587), 604_437_877_587)   // LATAM, real
  assert.equal(accionesPlausibles(188_446_126_794), 188_446_126_794)   // Santander Chile, real
  assert.equal(accionesPlausibles(505_277_464_000), 505_277_464_000)   // PAC: ×1000 e indistinguible → pasa
})

// ── 🧮 EBIT derivado (JNJ/LLY/GE no etiquetan OperatingIncomeLoss) ─────────────────────────────────
test('EBIT: se deriva de pretax + gasto financiero no operativo cuando falta OperatingIncomeLoss', () => {
  const cf = structuredClone(CF)
  delete (cf.facts['us-gaap'] as Record<string, unknown>).OperatingIncomeLoss
  ;(cf.facts['us-gaap'] as Record<string, unknown>)
    .IncomeLossFromContinuingOperationsBeforeIncomeTaxesExtraordinaryItemsNoncontrollingInterest =
      unidad([{ end: '2023-12-31', val: 170, fy: 2023, filed: '2024-02-01' }])
  ;(cf.facts['us-gaap'] as Record<string, unknown>).InterestExpenseNonoperating =
      unidad([{ end: '2023-12-31', val: 12, fy: 2023, filed: '2024-02-01' }])
  const f = extraerFundamentales(cf, 'LLY')!
  assert.equal(f.ebit, 182)
  assert.equal(f.ebitDerivado, true)
  assert.ok(Math.abs(f.roic! - 182 / (1100 - 200)) < 1e-9)   // el ROIC deja de ser incalculable
})

test('EBIT derivado sin gasto financiero publicado (caso GE): solo el pretax, nunca inventar el interés', () => {
  const cf = structuredClone(CF)
  delete (cf.facts['us-gaap'] as Record<string, unknown>).OperatingIncomeLoss
  ;(cf.facts['us-gaap'] as Record<string, unknown>)
    .IncomeLossFromContinuingOperationsBeforeIncomeTaxesExtraordinaryItemsNoncontrollingInterest =
      unidad([{ end: '2023-12-31', val: 170, fy: 2023, filed: '2024-02-01' }])
  assert.equal(extraerFundamentales(cf, 'GE')!.ebit, 170)   // por debajo del real = lado prudente
})

test('EBIT etiquetado gana al derivado (WMT publica los dos y difieren un 1%)', () => {
  const cf = structuredClone(CF)
  ;(cf.facts['us-gaap'] as Record<string, unknown>)
    .IncomeLossFromContinuingOperationsBeforeIncomeTaxesExtraordinaryItemsNoncontrollingInterest =
      unidad([{ end: '2023-12-31', val: 170, fy: 2023, filed: '2024-02-01' }])
  const f = extraerFundamentales(cf, 'WMT')!
  assert.equal(f.ebit, 180)
  assert.equal(f.ebitDerivado, false)
})

test('sin pretax NI OperatingIncomeLoss el EBIT queda indefinido, no 0', () => {
  const cf = structuredClone(CF)
  delete (cf.facts['us-gaap'] as Record<string, unknown>).OperatingIncomeLoss
  const f = extraerFundamentales(cf, 'X')!
  assert.equal(f.ebit, undefined)
  assert.equal(f.roic, undefined)
})

// ── 🪪 ADR de emisor extranjero: la capitalización NO es calculable ────────────────────────────────
test('presenta20F marca al emisor extranjero y bloquea el cruce con una capitalización en dólares', () => {
  const cf = structuredClone(CF) as unknown as { facts: Record<string, Record<string, { units: Record<string, Array<Record<string, unknown>>> }>> }
  for (const c of ['NetIncomeLoss', 'Assets']) for (const p of cf.facts['us-gaap'][c].units.USD) p.form = '20-F'
  const f = extraerFundamentales(cf as never, 'TLK')!
  assert.equal(f.emisorExtranjero, true)
  assert.equal(capitalizacionCruzable(f), false)
})

test('un 10-K en dólares sí es cruzable', () => {
  const f = extraerFundamentales(CF, 'X')!
  assert.equal(f.emisorExtranjero, false)
  assert.equal(capitalizacionCruzable(f), true)
})

test('capitalizacionCruzable rechaza la moneda local aunque el emisor presente 10-K', () => {
  assert.equal(capitalizacionCruzable({ moneda: 'JPY', emisorExtranjero: false }), false)
  assert.equal(capitalizacionCruzable(extraerFundamentales(CF_YENES, 'TM')), false)
  assert.equal(capitalizacionCruzable(null), false)
  assert.equal(capitalizacionCruzable({}), true)   // sin datos de moneda ⇒ USD por defecto
})

test('ventas del último ejercicio se exponen para el consumidor', () => {
  assert.equal(extraerFundamentales(CF, 'X')!.ventas, 1000)
})
