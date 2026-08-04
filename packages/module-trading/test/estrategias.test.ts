import { test } from 'node:test'
import assert from 'node:assert/strict'
import { evaluarMomentum, evaluarReversion, evaluarValor, evaluarCatalizador, torneo } from '../src/estrategias.ts'
import type { Indicadores, Fundamentales } from '../src/types.ts'

const alcista: Indicadores = { sma20: 110, sma50: 100, ema12: 111, ema26: 105, rsi14: 60, macd: 2, macdSignal: 1, atr14: 3, adx14: 22 }

test('momentum es alcista cuando ema12>ema26 y macd>signal Y hay tendencia (ADX≥20)', () => {
  const s = evaluarMomentum(alcista)
  assert.equal(s.direccion, 'alcista')
  assert.ok(s.confianza > 50)
})

test('momentum NO opera con cruce alcista pero ADX<20 (ruido lateral) — el gate del backtest', () => {
  const s = evaluarMomentum({ ...alcista, adx14: 15 })
  assert.equal(s.direccion, 'neutral')
  assert.ok(s.rationale.includes('sin tendencia'))
})

test('momentum NO opera sin ADX (serie corta): abstiene en vez de dar señal a ciegas', () => {
  const s = evaluarMomentum({ ...alcista, adx14: undefined })
  assert.equal(s.direccion, 'neutral')
})

test('reversion es alcista con rsi bajo (sobreventa) en rango (ADX flojo/ausente)', () => {
  const s = evaluarReversion({ ...alcista, rsi14: 25 })
  assert.equal(s.direccion, 'alcista')
  const s2 = evaluarReversion({ ...alcista, rsi14: 25, adx14: 18 })
  assert.equal(s2.direccion, 'alcista')
})

test('reversion NO fadea sobreventa si la tendencia es fuerte (ADX≥25) — el fix de ISRG', () => {
  const s = evaluarReversion({ ...alcista, rsi14: 25, adx14: 32 })
  assert.equal(s.direccion, 'neutral')
  assert.ok(s.rationale.includes('no fadear'))
})

test('valor es alcista con PER bajo y poca deuda', () => {
  const f: Fundamentales = { per: 10, deudaEbitda: 1, margenNeto: 0.2 }
  assert.equal(evaluarValor(f).direccion, 'alcista')
})

test('valor es neutral sin fundamentales', () => {
  assert.equal(evaluarValor({}).direccion, 'neutral')
})

test('catalizador marca alcista si earnings inminente', () => {
  const s = evaluarCatalizador({ proximoEarnings: '2026-07-20' }, '2026-07-17')
  assert.equal(s.direccion, 'alcista')
})

test('torneo devuelve una señal por estrategia', () => {
  const señales = torneo(alcista, { per: 10, deudaEbitda: 1, margenNeto: 0.2, proximoEarnings: '2026-07-20' }, '2026-07-17')
  assert.equal(señales.length, 4)
})
