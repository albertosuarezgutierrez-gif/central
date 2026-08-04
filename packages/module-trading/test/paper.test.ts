import { test } from 'node:test'
import assert from 'node:assert/strict'
import { dimensionar, abrir, aplicarStop, cerrar, pnlPosicion } from '../src/paper.ts'
import type { PaperPosicion } from '../src/types.ts'

test('dimensionar respeta el riesgo por operación (1% del NAV / distancia al stop)', () => {
  // NAV 10.000, riesgo 1% = 100€; entrada 100, stop 90 → distancia 10 → 10 acciones.
  assert.equal(dimensionar(10_000, 100, 90, 0.01), 10)
})

test('dimensionar es 0 si el stop está por encima de la entrada (inválido)', () => {
  assert.equal(dimensionar(10_000, 100, 105, 0.01), 0)
})

test('abrir crea posición con stop bajo la entrada por ATR', () => {
  const p = abrir('NVDA', 10, 100, 3, '2026-07-17')  // stop = 100 - 2*ATR(3) = 94
  assert.equal(p.stop, 94)
})

test('aplicarStop cierra si el precio perfora el stop', () => {
  const p: PaperPosicion = { simbolo: 'X', cantidad: 10, precioEntrada: 100, stop: 94, abiertaEn: 'd' }
  assert.equal(aplicarStop(p, 93), true)
  assert.equal(aplicarStop(p, 95), false)
})

test('pnlPosicion calcula ganancia/pérdida', () => {
  const p: PaperPosicion = { simbolo: 'X', cantidad: 10, precioEntrada: 100, stop: 94, abiertaEn: 'd' }
  assert.equal(pnlPosicion(p, 110), 100)
  assert.equal(pnlPosicion(p, 95), -50)
})
