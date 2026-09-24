import assert from 'node:assert/strict'
import { test } from 'node:test'
import { esBuenaBajada, pctBajadaAcumulada, pctUltimaBajada } from '../src/bajadas.ts'

test('bajada real del 1% (670.000 → 660.000, conector 24/09/2026) no avisa', () => {
  assert.equal(esBuenaBajada({ precio: 660000, anterior: 670000, inicial: 670000, bajadas: 1 }), false)
})

test('bajada real del 7% (279.000 → 259.000, Matalascañas) avisa', () => {
  assert.equal(esBuenaBajada({ precio: 259000, anterior: 279000, inicial: 279000, bajadas: 1 }), true)
})

test('justo en el umbral del 5% avisa', () => {
  assert.equal(esBuenaBajada({ precio: 95000, anterior: 100000, inicial: 100000, bajadas: 1 }), true)
})

test('varias bajadas pequeñas que suman ≥10% avisan (vendedor nervioso)', () => {
  assert.equal(esBuenaBajada({ precio: 89000, anterior: 92000, inicial: 100000, bajadas: 3 }), true)
})

test('lo acumulado solo cuenta con 2+ bajadas', () => {
  assert.equal(esBuenaBajada({ precio: 89000, anterior: null, inicial: 100000, bajadas: 1 }), false)
})

test('sin precio anterior ni inicial no se inventa bajada', () => {
  assert.equal(esBuenaBajada({ precio: 100000, anterior: null, inicial: null, bajadas: 1 }), false)
  assert.equal(pctUltimaBajada({ precio: 100000, anterior: null, inicial: null, bajadas: 0 }), null)
})

test('una subida no es bajada', () => {
  assert.equal(pctUltimaBajada({ precio: 110000, anterior: 100000, inicial: 100000, bajadas: 0 }), null)
  assert.equal(pctBajadaAcumulada({ precio: 110000, anterior: 100000, inicial: 100000, bajadas: 0 }), null)
})
