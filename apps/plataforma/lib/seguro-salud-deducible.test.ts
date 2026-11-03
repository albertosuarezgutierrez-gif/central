// Runner: `node --test lib/seguro-salud-deducible.test.ts`. Puro: sin BD.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ASEGURADOS_SALUD_ASISA, aplicarTopeSalud, tope } from './seguro-salud-deducible.ts'

const mes = (m: number) => `2026-${String(m).padStart(2, '0')}`
const cargos = (n: number, imp = 180.99) => Object.fromEntries(Array.from({ length: n }, (_, i) => [mes(i + 1), imp]))
const suma = (o: Record<string, number>) => Object.values(o).reduce((a, b) => a + b, 0)

test('tope = 500 € × asegurados (Alberto: cónyuge + 2 hijos = 3 → 1.500 €)', () => {
  assert.equal(ASEGURADOS_SALUD_ASISA, 3)
  assert.equal(tope(), 1500)
  assert.equal(tope(1), 500)
  assert.equal(tope(0), 0)
})

test('8 cargos de 180,99 € (1.447,92 €) quedan bajo 1.500 €: deducible íntegro', () => {
  const s = cargos(8)
  const r = aplicarTopeSalud(s, s)
  assert.ok(Math.abs(suma(r) - 1447.92) < 0.005)
})

test('9 cargos superan 1.500 €: se recorta el exceso de los últimos meses y el resto del gasto no se toca', () => {
  const salud = cargos(9)
  const gastos = { ...salud, [mes(9)]: salud[mes(9)] + 100 } // 100 € de otro gasto en septiembre
  const r = aplicarTopeSalud(gastos, salud)
  assert.ok(Math.abs(suma(r) - (1500 + 100)) < 0.005)
  assert.ok(Math.abs(r[mes(9)] - (100 + 1500 - 8 * 180.99)) < 0.005)
})

test('el tope con 1 asegurado (500 €) recorta aunque haya 8 cargos', () => {
  const s = cargos(8)
  assert.ok(Math.abs(suma(aplicarTopeSalud(s, s, 1)) - 500) < 0.005)
})
