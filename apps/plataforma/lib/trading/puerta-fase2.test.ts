import test from 'node:test'
import assert from 'node:assert/strict'
import { evaluarEscalera, emparejarOps, DIAS_TRAMO2, DIAS_TRAMO3, type CohorteEscalera } from './puerta-fase2.ts'

const cohorte = (o: Partial<CohorteEscalera>): CohorteEscalera => ({
  cohorte: 'c', dias: 200, alphaMediana: 0.02, maxDrawdown: -0.06, maxDrawdownBench: -0.05, ...o,
})

test('estado actual real (2 cestas jóvenes) → solo tramo 1 alcanzable', () => {
  const r = evaluarEscalera([cohorte({ cohorte: 'a', dias: 16 }), cohorte({ cohorte: 'b', dias: 14 })])
  assert.equal(r.alcanzable, 1)
  assert.equal(r.tramos[0].ok, true)   // el tramo 1 SIEMPRE está disponible-con-señal
  assert.equal(r.tramos[1].ok, false)
  assert.equal(r.tramos[2].ok, false)
})

test('cesta más vieja ≥4 meses batiendo → tramo 2 alcanzable (pero no el 3)', () => {
  const r = evaluarEscalera([cohorte({ cohorte: 'a', dias: DIAS_TRAMO2 }), cohorte({ cohorte: 'b', dias: 30 })])
  assert.equal(r.alcanzable, 2)
  assert.equal(r.tramos[2].ok, false)   // solo 2 cestas y ninguna ≥6 meses
})

test('cesta ≥4 meses pero SIN batir (alpha ≤ 0) NO abre el tramo 2', () => {
  const r = evaluarEscalera([cohorte({ cohorte: 'a', dias: DIAS_TRAMO2, alphaMediana: -0.01 })])
  assert.equal(r.alcanzable, 1)
})

test('3 cestas, la más vieja ≥6 meses, 2/3 baten, riesgo controlado → tramo 3', () => {
  const r = evaluarEscalera([
    cohorte({ cohorte: 'a', dias: DIAS_TRAMO3 }),
    cohorte({ cohorte: 'b', dias: 120 }),
    cohorte({ cohorte: 'c', dias: 90, alphaMediana: -0.01 }),
  ])
  assert.equal(r.alcanzable, 3)
})

test('drawdown de la más vieja >1,5× SPY tumba el tramo 3', () => {
  const r = evaluarEscalera([
    cohorte({ cohorte: 'a', dias: DIAS_TRAMO3, maxDrawdown: -0.2, maxDrawdownBench: -0.05 }),
    cohorte({ cohorte: 'b', dias: 120 }),
    cohorte({ cohorte: 'c', dias: 90 }),
  ])
  assert.equal(r.tramos[2].ok, false)
  assert.equal(r.alcanzable, 2)
})

test('alpha null cuenta como NO bate (no lo sé ≠ bate)', () => {
  const r = evaluarEscalera([cohorte({ cohorte: 'a', dias: DIAS_TRAMO2, alphaMediana: null })])
  assert.equal(r.alcanzable, 1)
})

test('sin cestas → tramo 1 y detalles honestos', () => {
  const r = evaluarEscalera([])
  assert.equal(r.alcanzable, 1)
  assert.match(r.tramos[1].detalle, /sin cohortes/)
})

test('emparejarOps: BUY→SELL por símbolo, desordenadas, y SELL sin BUY se ignora', () => {
  const ops = emparejarOps([
    { simbolo: 'MSFT', lado: 'SELL', precio: 110, fecha: '2026-08-10' },
    { simbolo: 'MSFT', lado: 'BUY', precio: 100, fecha: '2026-08-01' },
    { simbolo: 'NVDA', lado: 'SELL', precio: 90, fecha: '2026-08-05' },   // sin BUY previa → fuera
    { simbolo: 'AAPL', lado: 'BUY', precio: 200, fecha: '2026-08-02' },   // sigue abierta → fuera
  ])
  assert.equal(ops.length, 1)
  assert.equal(ops[0].simbolo, 'MSFT')
  assert.ok(Math.abs(ops[0].retorno - 0.1) < 1e-9)
})
