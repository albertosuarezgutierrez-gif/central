import { test } from 'node:test'
import assert from 'node:assert/strict'
import { backtestSimbolo } from '../src/backtest.ts'
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

test('backtest de una caída sostenida no acumula ganancias (stops/o sin entradas)', () => {
  const cierres = Array.from({ length: 90 }, (_, i) => 100 * Math.pow(0.99, i))  // −1%/día
  const r = backtestSimbolo(velasDe(cierres), { minVelas: 50 })
  assert.ok(r.retornoTotalPct <= 0)
})

test('backtest sin velas suficientes no opera', () => {
  const r = backtestSimbolo(velasDe([100, 101, 102]), { minVelas: 50 })
  assert.equal(r.nTrades, 0)
  assert.equal(r.retornoTotalPct, 0)
})
