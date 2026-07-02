import { strict as assert } from 'assert'
import { test } from 'node:test'

function calcularMesesRestantes(year: number, now: Date = new Date()): number {
  const yearActual = now.getFullYear()
  if (yearActual > year) return 0
  if (yearActual < year) return 12
  const mesActual = now.getMonth() + 1
  return Math.max(0, 12 - mesActual)
}

test('julio 2026 devuelve 5 meses restantes', () => {
  assert.equal(calcularMesesRestantes(2026, new Date('2026-07-02')), 5)
})

test('diciembre devuelve 0', () => {
  assert.equal(calcularMesesRestantes(2026, new Date('2026-12-01')), 0)
})

test('enero devuelve 11', () => {
  assert.equal(calcularMesesRestantes(2026, new Date('2026-01-15')), 11)
})

test('año pasado devuelve 0', () => {
  assert.equal(calcularMesesRestantes(2025, new Date('2026-07-02')), 0)
})

test('año futuro devuelve 12', () => {
  assert.equal(calcularMesesRestantes(2027, new Date('2026-07-02')), 12)
})
