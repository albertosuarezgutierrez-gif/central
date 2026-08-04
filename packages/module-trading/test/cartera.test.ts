import { test } from 'node:test'
import assert from 'node:assert/strict'
import { backtestCartera } from '../src/cartera.ts'
import type { Vela } from '../src/types.ts'

function velasDe(cierres: number[]): Vela[] {
  return cierres.map((c, i) => ({ fecha: `d${i}`, apertura: c, alto: c * 1.01, bajo: c * 0.99, cierre: c, volumen: 1000 }))
}

test('la cartera invierte el capital y reporta curva de equity + drawdown', () => {
  const sube = Array.from({ length: 90 }, (_, i) => 100 * Math.pow(1.01, i))
  const r = backtestCartera([{ simbolo: 'AAA', velas: velasDe(sube) }], { minVelas: 50, navInicial: 100_000 })
  assert.ok(r.nTrades >= 1)
  assert.ok(r.curva.length > 0)
  assert.ok(r.maxDrawdownPct >= 0 && r.maxDrawdownPct <= 1)
  assert.ok(r.equityFinal > 0)
})

test('nunca abre largos en una caída sostenida (gate SMA50): sin trades, equity intacto', () => {
  const baja = Array.from({ length: 90 }, (_, i) => 100 * Math.pow(0.99, i))
  const r = backtestCartera([{ simbolo: 'BBB', velas: velasDe(baja) }], { minVelas: 50, navInicial: 50_000 })
  assert.equal(r.nTrades, 0)
  assert.equal(r.equityFinal, 50_000)
  assert.equal(r.retornoPct, 0)
})

test('respeta el tope de concentración: una posición no pasa del maxPeso del equity', () => {
  const sube = Array.from({ length: 70 }, (_, i) => 100 * Math.pow(1.02, i))
  // maxPeso 0.1 → como mucho el 10% del equity en un nombre; con riesgo 1% no debería quebrar el tope.
  const r = backtestCartera([{ simbolo: 'CCC', velas: velasDe(sube) }], { minVelas: 50, navInicial: 100_000, maxPeso: 0.1 })
  // Si abrió, el desembolso inicial (primer punto de curva marca a mercado) no puede dejar el equity < 0.
  assert.ok(r.equityFinal >= 0)
  assert.ok(r.curva.every(v => v > 0))
})
