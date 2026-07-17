import { test } from 'node:test'
import assert from 'node:assert/strict'
import { evaluarMomentum, evaluarReversion, evaluarValor, evaluarCatalizador, torneo } from '../src/estrategias.ts'
import type { Indicadores, Fundamentales } from '../src/types.ts'

const alcista: Indicadores = { sma20: 110, sma50: 100, ema12: 111, ema26: 105, rsi14: 60, macd: 2, macdSignal: 1, atr14: 3 }

test('momentum es alcista cuando ema12>ema26 y macd>signal', () => {
  const s = evaluarMomentum(alcista)
  assert.equal(s.direccion, 'alcista')
  assert.ok(s.confianza > 50)
})

test('reversion es alcista con rsi bajo (sobreventa)', () => {
  const s = evaluarReversion({ ...alcista, rsi14: 25 })
  assert.equal(s.direccion, 'alcista')
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
