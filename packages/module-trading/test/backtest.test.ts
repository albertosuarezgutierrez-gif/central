import { test } from 'node:test'
import assert from 'node:assert/strict'
import { backtestSimbolo, backtestOOS } from '../src/backtest.ts'
import type { Vela } from '../src/types.ts'

// Genera velas con una trayectoria de cierres (rango diario simple alrededor del cierre).
function velasDe(cierres: number[]): Vela[] {
  return cierres.map((c, i) => ({ fecha: `d${i}`, apertura: c, alto: c * 1.01, bajo: c * 0.99, cierre: c, volumen: 1000 }))
}

test('backtest de una tendencia alcista larga entra y termina en positivo', () => {
  const cierres = Array.from({ length: 90 }, (_, i) => 100 * Math.pow(1.01, i))  // +1%/día
  const r = backtestSimbolo(velasDe(cierres), { minVelas: 50, horizonteDias: 10 })
  assert.ok(r.nTrades >= 1)
  assert.ok(r.retornoTotalPct > 0)
  assert.ok(r.winRate > 0.5)
})

test('backtest de una caída sostenida NO abre largos (gate SMA50): 0 trades', () => {
  const cierres = Array.from({ length: 90 }, (_, i) => 100 * Math.pow(0.99, i))  // −1%/día
  const r = backtestSimbolo(velasDe(cierres), { minVelas: 50 })
  assert.equal(r.nTrades, 0)              // el precio siempre bajo la SMA50 → ninguna entrada
  assert.ok(r.retornoTotalPct <= 0)
})

test('el resultado incluye el benchmark buy-and-hold y si lo bate', () => {
  const cierres = Array.from({ length: 90 }, (_, i) => 100 * Math.pow(1.01, i))  // +1%/día
  const r = backtestSimbolo(velasDe(cierres), { minVelas: 50 })
  assert.ok(r.retornoBuyHoldPct > 0)                                    // mantener sube en un +1%/día
  assert.equal(r.baten, r.retornoTotalPct > r.retornoBuyHoldPct)        // coherencia del flag
})

test('backtestOOS parte el histórico en dos y corre cada mitad por separado', () => {
  const cierres = Array.from({ length: 160 }, (_, i) => 100 * Math.pow(1.01, i))
  const oos = backtestOOS(velasDe(cierres), { minVelas: 50 })
  assert.equal(oos.corte, 80)
  assert.ok('retornoTotalPct' in oos.enMuestra)
  assert.ok('retornoTotalPct' in oos.fueraMuestra)
})

test('backtest sin velas suficientes no opera', () => {
  const r = backtestSimbolo(velasDe([100, 101, 102]), { minVelas: 50 })
  assert.equal(r.nTrades, 0)
  assert.equal(r.retornoTotalPct, 0)
})
