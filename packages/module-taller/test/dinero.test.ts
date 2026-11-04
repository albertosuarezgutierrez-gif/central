import { test } from 'node:test'
import assert from 'node:assert/strict'
import { dividirRedondeando, formatearEur } from '../src/index.ts'

test('redondeo a la mitad hacia fuera del cero, en entero', () => {
  assert.equal(dividirRedondeando(5, 10), 1) // 0,5 → 1
  assert.equal(dividirRedondeando(4, 10), 0)
  assert.equal(dividirRedondeando(-5, 10), -1)
  assert.equal(dividirRedondeando(15, 10), 2)
})

test('dividirRedondeando rechaza floats y divisor ≤ 0', () => {
  assert.throws(() => dividirRedondeando(1.5, 2))
  assert.throws(() => dividirRedondeando(1, 0))
})

test('formato español del dinero', () => {
  assert.equal(formatearEur(216249), '2.162,49€')
  assert.equal(formatearEur(100000), '1.000,00€')
  assert.equal(formatearEur(5), '0,05€')
  assert.equal(formatearEur(123456789), '1.234.567,89€')
  assert.equal(formatearEur(-216249), '-2.162,49€')
  assert.throws(() => formatearEur(1.5))
})
