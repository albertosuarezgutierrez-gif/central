import test from 'node:test'
import assert from 'node:assert/strict'
import { evaluarEscalera, evaluarApagado, emparejarOps, DIAS_TRAMO2, DIAS_TRAMO3, DIAS_APAGADO, type CohorteEscalera } from './puerta-fase2.ts'

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

test('cobertura insuficiente: un alpha positivo medido sobre media cesta NO sube al tramo 2', () => {
  // Enmienda de operacionalización (auditoría 11/08/2026): con series truncadas el alpha es de OTRA
  // cesta. cobertura < 80% → no evaluable (y el detalle lo declara), aunque el número diera ✅.
  const r = evaluarEscalera([cohorte({ cohorte: 'a', dias: DIAS_TRAMO2, alphaMediana: 0.05, cobertura: 0.5 })])
  assert.equal(r.alcanzable, 1)
  assert.match(r.tramos[1].detalle, /cobertura 50%/)
})

test('cobertura suficiente (≥80%) o desconocida (snapshots antiguos) no bloquea', () => {
  const ok = evaluarEscalera([cohorte({ cohorte: 'a', dias: DIAS_TRAMO2, cobertura: 7 / 8 })])
  assert.equal(ok.alcanzable, 2)
  const compat = evaluarEscalera([cohorte({ cohorte: 'a', dias: DIAS_TRAMO2, cobertura: null })])
  assert.equal(compat.alcanzable, 2)
})

test('cobertura insuficiente también invalida el criterio de riesgo del tramo 3', () => {
  const r = evaluarEscalera([
    cohorte({ cohorte: 'a', dias: DIAS_TRAMO3, cobertura: 0.5 }),
    cohorte({ cohorte: 'b', dias: DIAS_TRAMO2 }),
    cohorte({ cohorte: 'c', dias: 90 }),
  ])
  assert.equal(r.tramos[2].ok, false)
})

// ── 🛑 Regla de apagado (firmada 2026-08-15) ─────────────────────────────────────────────────────

test('apagado: cestas jóvenes → NO evaluable todavía (reloj declarado)', () => {
  const r = evaluarApagado([cohorte({ cohorte: 'a', dias: 200 }), cohorte({ cohorte: 'b', dias: 120 }), cohorte({ cohorte: 'c', dias: 90 })])
  assert.equal(r.evaluable, false)
  assert.equal(r.apagar, false)
  assert.match(r.detalle, /reloj/)
})

test('apagado: más vieja ≥365 pero <3 cestas distintas → NO evaluable (la cadencia falló, se declara)', () => {
  const r = evaluarApagado([cohorte({ cohorte: 'a', dias: DIAS_APAGADO }), cohorte({ cohorte: 'b', dias: 300 })])
  assert.equal(r.evaluable, false)
  assert.match(r.detalle, /2\/3/)   // «cestas distintas 2/3»
})

test('apagado: al año, menos de 2/3 baten → veredicto NEGATIVO', () => {
  const r = evaluarApagado([
    cohorte({ cohorte: 'a', dias: DIAS_APAGADO, alphaMediana: -0.01 }),
    cohorte({ cohorte: 'b', dias: 300, alphaMediana: 0.02 }),
    cohorte({ cohorte: 'c', dias: 250, alphaMediana: -0.03 }),
  ])
  assert.equal(r.evaluable, true)
  assert.equal(r.apagar, true)
  assert.match(r.detalle, /NEGATIVO/)
})

test('apagado: al año, ≥2/3 baten → el experimento sigue', () => {
  const r = evaluarApagado([
    cohorte({ cohorte: 'a', dias: DIAS_APAGADO, alphaMediana: 0.01 }),
    cohorte({ cohorte: 'b', dias: 300, alphaMediana: 0.02 }),
    cohorte({ cohorte: 'c', dias: 250, alphaMediana: -0.03 }),
  ])
  assert.equal(r.evaluable, true)
  assert.equal(r.apagar, false)
})

test('apagado: alpha null o cobertura floja cuentan como NO bate (no lo sé ≠ bate)', () => {
  const r = evaluarApagado([
    cohorte({ cohorte: 'a', dias: DIAS_APAGADO, alphaMediana: null }),
    cohorte({ cohorte: 'b', dias: 300, alphaMediana: 0.05, cobertura: 0.5 }),
    cohorte({ cohorte: 'c', dias: 250, alphaMediana: 0.02 }),
  ])
  assert.equal(r.evaluable, true)
  assert.equal(r.apagar, true)   // solo 1/3 bate de forma fiable
})
