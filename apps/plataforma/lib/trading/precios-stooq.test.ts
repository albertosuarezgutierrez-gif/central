import { test } from 'node:test'
import assert from 'node:assert/strict'
import { stooqSimbolo, aStooqFecha, urlStooq, parseStooqCsv, parseStooqCsvVol, cierresDe, yahooSimbolo, parseYahooChart, parseYahooChartVol } from './precios-stooq.ts'

test('stooqSimbolo añade .us, pasa el punto de clase a guion, respeta índice y mercado', () => {
  assert.equal(stooqSimbolo('AAPL'), 'aapl.us')
  assert.equal(stooqSimbolo('spy'), 'spy.us')
  assert.equal(stooqSimbolo('BRK.B'), 'brk-b.us')  // punto de clase → guion
  assert.equal(stooqSimbolo('SPY.US'), 'spy.us')   // ya trae mercado
  assert.equal(stooqSimbolo('^spx'), '^spx')       // índice
})

test('yahooSimbolo pasa el punto de clase a guion', () => {
  assert.equal(yahooSimbolo('BRK.B'), 'BRK-B')
  assert.equal(yahooSimbolo('spy'), 'SPY')
})

test('parseYahooChart extrae cierres y filtra nulos', () => {
  const json = { chart: { result: [{ indicators: { quote: [{ close: [100, null, 102.5, 0, 101] }] } }] } }
  assert.deepEqual(parseYahooChart(json), [100, 102.5, 101])   // descarta null y 0
  assert.deepEqual(parseYahooChart({ chart: { result: [] } }), [])
  assert.deepEqual(parseYahooChart({}), [])
})

test('aStooqFecha convierte YYYY-MM-DD → YYYYMMDD (y vacío si no es fecha)', () => {
  assert.equal(aStooqFecha('2024-01-31'), '20240131')
  assert.equal(aStooqFecha('2024-01-31T10:00:00Z'), '20240131')
  assert.equal(aStooqFecha('ayer'), '')
})

test('urlStooq incluye símbolo y rango cuando hay fechas válidas', () => {
  const u = urlStooq('AAPL', '2023-01-01', '2025-01-01')
  assert.match(u, /s=aapl\.us/)
  assert.match(u, /d1=20230101/)
  assert.match(u, /d2=20250101/)
  assert.match(u, /i=d/)
  // Sin fechas válidas, no añade rango.
  assert.doesNotMatch(urlStooq('AAPL', 'x', 'y'), /d1=/)
})

test('parseStooqCsv extrae fecha+cierre, ignora cabecera y filas inválidas', () => {
  const csv = [
    'Date,Open,High,Low,Close,Volume',
    '2024-01-02,185.0,186.0,184.0,185.64,50000000',
    '2024-01-03,184.2,185.0,183.0,184.25,48000000',
    '',
    'No data',
    '2024-01-04,,,,,,',                       // cierre no numérico → descartada
  ].join('\n')
  const r = parseStooqCsv(csv)
  assert.equal(r.length, 2)
  assert.deepEqual(r[0], { fecha: '2024-01-02', cierre: 185.64 })
  assert.deepEqual(cierresDe(r), [185.64, 184.25])
})

test('parseStooqCsv devuelve [] con "No data"', () => {
  assert.deepEqual(parseStooqCsv('Date,Open,High,Low,Close,Volume\nNo data'), [])
})

// ── 📊 Volumen (señal de acumulación/distribución) ───────────────────────────────────────────────

test('parseStooqCsvVol conserva el volumen y lo deja null cuando falta o no es numérico', () => {
  const csv = [
    'Date,Open,High,Low,Close,Volume',
    '2024-01-02,184,186,183,185.64,58000000',
    '2024-01-03,185,186,183,184.25,',          // sin volumen → null
  ].join('\n')
  const r = parseStooqCsvVol(csv)
  assert.equal(r.length, 2)
  assert.deepEqual(r[0], { fecha: '2024-01-02', cierre: 185.64, volumen: 58000000 })
  assert.equal(r[1].volumen, null)
})

test('parseYahooChartVol alinea cierre+volumen saltando los nulos de cierre', () => {
  const json = {
    chart: {
      result: [{
        timestamp: [1700000000, 1700086400, 1700172800],
        indicators: { quote: [{ close: [100, null, 102], volume: [5000, 9999, null] }] },
      }],
    },
  }
  const r = parseYahooChartVol(json)
  assert.equal(r.length, 2)                     // el cierre null cae con su volumen
  assert.equal(r[0].volumen, 5000)
  assert.equal(r[1].cierre, 102)
  assert.equal(r[1].volumen, null)              // volumen null se conserva como null
})
