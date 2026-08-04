import test from 'node:test'
import assert from 'node:assert/strict'
import { extraerGapPremarket, urlYahooPremarket, mensajePremarket, UMBRAL_GAP } from './premarket.ts'

// Fixture mínima del chart v8 de Yahoo con includePrePost: ventana pre 4:00-9:30 ET (epoch de mentira),
// velas dentro y fuera de la ventana, y nulos intercalados (así responde Yahoo de verdad).
const PRE_START = 1_000_000
const PRE_END = 1_019_800   // pre.end exclusivo
const chart = (over: object = {}) => ({
  chart: {
    result: [{
      meta: { chartPreviousClose: 100, currentTradingPeriod: { pre: { start: PRE_START, end: PRE_END } } },
      timestamp: [PRE_START - 300, PRE_START, PRE_START + 300, PRE_START + 600, PRE_END, PRE_END + 300],
      indicators: { quote: [{ close: [99, 101, null, 107, 120, 130] }] },
      ...over,
    }],
  },
})

test('extraerGapPremarket usa la ÚLTIMA vela válida DENTRO de la ventana pre', () => {
  const g = extraerGapPremarket(chart())
  assert.ok(g)
  // 99 queda antes de pre.start y 120/130 en/tras pre.end; el null se salta → última pre válida = 107.
  assert.equal(g.ultimoPre, 107)
  assert.equal(g.cierrePrevio, 100)
  assert.ok(Math.abs(g.gap - 0.07) < 1e-9)
  assert.equal(g.velas, 2)              // 101 y 107
  assert.ok(g.gap >= UMBRAL_GAP)        // 7% dispararía el aviso
})

test('extraerGapPremarket → null sin velas dentro de la ventana (festivo/mercado cerrado)', () => {
  const g = extraerGapPremarket(chart({ timestamp: [PRE_END, PRE_END + 300], indicators: { quote: [{ close: [120, 130] }] } }))
  assert.equal(g, null)
})

test('extraerGapPremarket → null sin cierre previo o sin ventana pre; tolera JSON roto', () => {
  assert.equal(extraerGapPremarket(chart({ meta: { currentTradingPeriod: { pre: { start: PRE_START, end: PRE_END } } } })), null)
  assert.equal(extraerGapPremarket(chart({ meta: { chartPreviousClose: 100 } })), null)
  assert.equal(extraerGapPremarket(null), null)
  assert.equal(extraerGapPremarket({}), null)
  assert.equal(extraerGapPremarket({ chart: { result: [] } }), null)
})

test('mensajePremarket ordena por |gap|, adjunta 📰 y calla sin movimientos', () => {
  assert.equal(mensajePremarket([]), null)
  const msg = mensajePremarket([
    { simbolo: 'AAA', gap: 0.031, etiquetas: [] },
    { simbolo: 'LNG', gap: -0.072, etiquetas: ['salida/entrada de directivos'] },
  ])!
  const lineas = msg.split('\n')
  assert.ok(lineas[1].includes('<b>LNG</b> -7.2%') && lineas[1].includes('📰 salida/entrada de directivos'))
  assert.ok(lineas[2].includes('<b>AAA</b> +3.1%'))
  assert.ok(msg.includes('SOLO paper'))
})

test('urlYahooPremarket normaliza el símbolo y pide includePrePost a 5m', () => {
  const u = urlYahooPremarket('brk.b')
  assert.ok(u.includes('/chart/BRK-B?'))
  assert.ok(u.includes('interval=5m'))
  assert.ok(u.includes('includePrePost=true'))
})
