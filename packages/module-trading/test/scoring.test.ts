import { test } from 'node:test'
import assert from 'node:assert/strict'
import { puntuarTesis, agregarStats, ajustesDeStats, COSTE_ROUNDTRIP } from '../src/scoring.ts'
import { torneo } from '../src/estrategias.ts'
import type { Tesis, Indicadores } from '../src/types.ts'

test('ajustesDeStats sube la buena estrategia, baja la mala y NO ajusta con poca muestra', () => {
  const a = ajustesDeStats({
    momentum: { hitRate: 0.7, retornoMedio: 0.02, n: 40 },   // buena → +10
    reversion: { hitRate: 0.3, retornoMedio: -0.03, n: 40 },  // mala → -10-5 = -15
    valor: { hitRate: 0.9, retornoMedio: 0.1, n: 5 },         // muestra insuficiente → sin ajuste
  })
  assert.ok((a.momentum ?? 0) > 0)
  assert.ok((a.reversion ?? 0) < 0)
  assert.equal(a.valor, undefined)
})

test('torneo aplica el delta de aprendizaje solo a señales direccionales, acotado', () => {
  const ind: Indicadores = { sma20: 110, sma50: 100, ema12: 111, ema26: 105, rsi14: 60, macd: 2, macdSignal: 1, atr14: 3, adx14: 22 }
  const base = torneo(ind, {}, '2026-07-18')
  const ajustado = torneo(ind, {}, '2026-07-18', { momentum: 10 })
  const mBase = base.find(s => s.estrategia === 'momentum')!
  const mAj = ajustado.find(s => s.estrategia === 'momentum')!
  assert.equal(mAj.confianza, mBase.confianza + 10)
  // una estrategia neutral no se toca aunque tenga delta
  const rev = ajustado.find(s => s.estrategia === 'reversion')!
  assert.equal(rev.direccion, 'neutral')
})

const tesis = (over: Partial<Tesis> = {}): Tesis => ({
  simbolo: 'X', fecha: '2026-07-01', estrategia: 'momentum', direccion: 'alcista',
  confianza: 70, horizonteDias: 10, precioRef: 100,
  indicadores: {} as any, rationale: '', ...over,
})

test('puntuarTesis acierta si alcista y el precio subió', () => {
  const r = puntuarTesis(tesis(), 110)
  assert.equal(r.acierto, true)
  assert.ok(Math.abs(r.retorno - 0.1) < 1e-9)
})

test('puntuarTesis falla si alcista y el precio bajó', () => {
  assert.equal(puntuarTesis(tesis(), 95).acierto, false)
})

test('bajista acierta si el precio bajó y su retorno es el de SEGUIR la tesis (positivo)', () => {
  const r = puntuarTesis(tesis({ direccion: 'bajista' }), 95)
  assert.equal(r.acierto, true)
  assert.ok(Math.abs(r.retorno - 0.05) < 1e-9)   // ganó un 5%, no perdió
})

test('bajista que falla (el precio subió) anota retorno negativo', () => {
  const r = puntuarTesis(tesis({ direccion: 'bajista' }), 110)
  assert.equal(r.acierto, false)
  assert.ok(Math.abs(r.retorno - -0.1) < 1e-9)
})

test('neutral está fuera del mercado: retorno 0 suba o baje el precio', () => {
  assert.equal(puntuarTesis(tesis({ direccion: 'neutral' }), 95).retorno, 0)
  assert.equal(puntuarTesis(tesis({ direccion: 'neutral' }), 130).retorno, 0)
  // el acierto sigue midiendo el movimiento bruto (<2% = acertó la lateralidad)
  assert.equal(puntuarTesis(tesis({ direccion: 'neutral' }), 101).acierto, true)
  assert.equal(puntuarTesis(tesis({ direccion: 'neutral' }), 130).acierto, false)
})

test('agregarStats calcula hit-rate por estrategia', () => {
  const stats = agregarStats([
    { estrategia: 'momentum', acierto: true, retorno: 0.1 },
    { estrategia: 'momentum', acierto: false, retorno: -0.05 },
    { estrategia: 'valor', acierto: true, retorno: 0.2 },
  ])
  assert.equal(stats.momentum.hitRate, 0.5)
  assert.equal(stats.valor.hitRate, 1)
})

// ── H13 (alfa) y H14 (costes), 28/08/2026. Se RECOLECTAN: `ajustesDeStats` sigue decidiendo con
// `hitRate`/`retornoMedio` brutos y absolutos, y estos tests fijan que así siga.

test('alfa: una alcista que sube menos que el índice acierta pero NO bate al mercado', () => {
  const t: Tesis = { simbolo: 'X', estrategia: 'momentum', direccion: 'alcista', confianza: 60, precioRef: 100, horizonteDias: 10 }
  const r = puntuarTesis(t, 103, 0.05)   // +3% con el índice al +5%
  assert.equal(r.acierto, true)
  assert.ok(Math.abs(r.retorno - 0.03) < 1e-9)
  assert.ok(Math.abs((r.retornoAlfa as number) + 0.02) < 1e-9)
  assert.equal(r.aciertoAlfa, false)
})

test('alfa: una bajista que cae MENOS que el índice pierde alfa (estar corto no basta)', () => {
  const t: Tesis = { simbolo: 'X', estrategia: 'reversion', direccion: 'bajista', confianza: 60, precioRef: 100, horizonteDias: 10 }
  const r = puntuarTesis(t, 95, -0.08)   // −5% con el índice al −8%
  assert.equal(r.acierto, true)          // acertó la caída
  assert.ok(Math.abs(r.retorno - 0.05) < 1e-9)
  assert.ok(Math.abs((r.retornoAlfa as number) + 0.03) < 1e-9)   // pero peor que el mercado
  assert.equal(r.aciertoAlfa, false)
})

test('alfa: una neutral está fuera del mercado, así que su alfa es 0, no el índice cambiado de signo', () => {
  const t: Tesis = { simbolo: 'X', estrategia: 'valor', direccion: 'neutral', confianza: 50, precioRef: 100, horizonteDias: 10 }
  const r = puntuarTesis(t, 101, 0.05)
  assert.equal(r.retorno, 0)
  assert.equal(r.retornoAlfa, 0)
})

test('sin benchmark el alfa es NULL, nunca 0 (no se pudo medir ≠ no batió al mercado)', () => {
  const t: Tesis = { simbolo: 'X', estrategia: 'momentum', direccion: 'alcista', confianza: 60, precioRef: 100, horizonteDias: 10 }
  assert.equal(puntuarTesis(t, 110).retornoAlfa, null)
  assert.equal(puntuarTesis(t, 110).aciertoAlfa, null)
  assert.equal(puntuarTesis(t, 110, null).retornoAlfa, null)
})

test('coste: el neto es el bruto menos el peaje, también cuando el bruto es 0', () => {
  const alc: Tesis = { simbolo: 'X', estrategia: 'momentum', direccion: 'alcista', confianza: 60, precioRef: 100, horizonteDias: 10 }
  const r = puntuarTesis(alc, 101)
  assert.ok(Math.abs(r.retornoNeto - (r.retorno - COSTE_ROUNDTRIP)) < 1e-12)
  const neu: Tesis = { ...alc, direccion: 'neutral' }
  assert.ok(Math.abs(puntuarTesis(neu, 101).retornoNeto + COSTE_ROUNDTRIP) < 1e-12)
})

test('agregarStats no cuenta como alfa 0 las observaciones SIN benchmark', () => {
  const t: Tesis = { simbolo: 'X', estrategia: 'momentum', direccion: 'alcista', confianza: 60, precioRef: 100, horizonteDias: 10 }
  const stats = agregarStats([
    puntuarTesis(t, 110, 0.00),   // alfa +10%
    puntuarTesis(t, 110),         // sin benchmark → fuera de la media de alfa
  ])
  assert.equal(stats.momentum.n, 2)
  assert.equal(stats.momentum.nAlfa, 1)
  assert.ok(Math.abs((stats.momentum.retornoAlfaMedio as number) - 0.10) < 1e-9)
})

test('sin ninguna observación con benchmark, el alfa medio es NULL y el hit-rate de alfa también', () => {
  const t: Tesis = { simbolo: 'X', estrategia: 'valor', direccion: 'alcista', confianza: 60, precioRef: 100, horizonteDias: 10 }
  const stats = agregarStats([puntuarTesis(t, 110)])
  assert.equal(stats.valor.retornoAlfaMedio, null)
  assert.equal(stats.valor.hitRateAlfa, null)
  assert.equal(stats.valor.nAlfa, 0)
})

test('el torneo NO usa todavía ni el alfa ni el neto: ajustesDeStats decide con lo bruto', () => {
  // Misma estrategia, hit-rate bruto bueno pero alfa desastroso: el delta sigue siendo el bruto.
  const a = ajustesDeStats({ momentum: { hitRate: 0.7, retornoMedio: 0.02, n: 40 } })
  assert.equal(a.momentum, Math.round((0.7 - 0.5) * 50))
})
