import { test } from 'node:test'
import assert from 'node:assert/strict'
import { retornoTotal, evaluarCestaVsBench } from '../src/seleccionEval.ts'

test('retornoTotal = último/primero − 1; null si <2 puntos o primero 0', () => {
  assert.ok(Math.abs(retornoTotal([100, 150])! - 0.5) < 1e-9)
  assert.ok(Math.abs(retornoTotal([100, 120, 90])! - (-0.1)) < 1e-9)
  assert.equal(retornoTotal([100]), null)
  assert.equal(retornoTotal([0, 50]), null)
})

test('evaluarCestaVsBench: cesta equiponderada = media de retornos, alpha vs bench', () => {
  const cesta = [
    { simbolo: 'A', cierres: [100, 160] },   // +60%
    { simbolo: 'B', cierres: [50, 60] },     // +20%
  ]
  const bench = [100, 130]                    // +30%
  const r = evaluarCestaVsBench(cesta, bench)!
  assert.equal(r.n, 2)
  assert.ok(Math.abs(r.retornoCesta - 0.4) < 1e-9)   // media(0.6, 0.2)
  assert.ok(Math.abs(r.retornoBench - 0.3) < 1e-9)
  assert.ok(Math.abs(r.alpha - 0.1) < 1e-9)
  assert.equal(r.bate, true)
  assert.equal(r.ganadoresVsBench, 1)                 // solo A (+60%) bate al +30%
  assert.equal(r.porSimbolo[0].simbolo, 'A')          // ordenado de mejor a peor
})

test('evaluarCestaVsBench: cesta que NO bate al benchmark', () => {
  const cesta = [{ simbolo: 'X', cierres: [100, 105] }]   // +5%
  const r = evaluarCestaVsBench(cesta, [100, 120])!        // bench +20%
  assert.equal(r.bate, false)
  assert.ok(r.alpha < 0)
})

test('evaluarCestaVsBench descarta símbolos sin datos; null si ninguno o bench inválido', () => {
  const cesta = [
    { simbolo: 'A', cierres: [100, 110] },
    { simbolo: 'B', cierres: [50] },          // insuficiente → descartado
  ]
  const r = evaluarCestaVsBench(cesta, [100, 100])!
  assert.equal(r.n, 1)
  assert.equal(r.retornoBench, 0)
  assert.equal(evaluarCestaVsBench([{ simbolo: 'Z', cierres: [1] }], [100, 110]), null)  // sin cesta válida
  assert.equal(evaluarCestaVsBench(cesta, [100]), null)                                   // bench inválido
})
