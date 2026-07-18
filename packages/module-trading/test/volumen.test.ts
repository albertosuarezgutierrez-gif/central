import { test } from 'node:test'
import assert from 'node:assert/strict'
import { rvol, tendenciaVolumen, volumenInusual, confirmaVolumen } from '../src/volumen.ts'

// 20 sesiones a 100 de media + un pico de 300 hoy → rvol 3.
const base = Array.from({ length: 20 }, () => 100)

test('rvol compara la última sesión con la media previa', () => {
  assert.equal(rvol([...base, 300], 20), 3)
  assert.equal(rvol([...base, 100], 20), 1)
  assert.equal(rvol([1, 2], 20), null)   // insuficientes
})

test('volumenInusual dispara con rvol >= umbral', () => {
  assert.equal(volumenInusual([...base, 250], 2), true)   // rvol 2.5
  assert.equal(volumenInusual([...base, 150], 2), false)  // rvol 1.5
})

test('tendenciaVolumen positiva si el interés crece', () => {
  const creciendo = [...Array(20).fill(100), ...Array(5).fill(200)]
  const t = tendenciaVolumen(creciendo, 5, 20)
  assert.ok(t !== null && t > 0.9)   // ~ +100%
})

test('confirmaVolumen clasifica el respaldo del movimiento', () => {
  assert.equal(confirmaVolumen('alcista', 1.3), 'confirma')
  assert.equal(confirmaVolumen('alcista', 1.0), 'normal')
  assert.equal(confirmaVolumen('alcista', 0.6), 'flojo')
  assert.equal(confirmaVolumen('neutral', 5), 'na')
})
