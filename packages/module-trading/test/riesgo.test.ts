import { test } from 'node:test'
import assert from 'node:assert/strict'
import { superaConcentracion, esPromediarPerdedor, superaLimiteOps, earningsInminente } from '../src/riesgo.ts'
import type { PaperPosicion } from '../src/types.ts'

const pos: PaperPosicion = { simbolo: 'NVDA', cantidad: 10, precioEntrada: 100, stop: 90, abiertaEn: '2026-07-01' }

test('superaConcentracion true si la nueva posición pasa del 20% del NAV', () => {
  assert.equal(superaConcentracion(2500, 10_000, 0.2), true)   // 25% > 20%
  assert.equal(superaConcentracion(1500, 10_000, 0.2), false)  // 15% < 20%
})

test('esPromediarPerdedor true si añades a una posición en pérdida', () => {
  assert.equal(esPromediarPerdedor(pos, 90), true)   // precio 90 < entrada 100
  assert.equal(esPromediarPerdedor(pos, 110), false)
})

test('superaLimiteOps true al pasar el máximo de ops por nombre', () => {
  assert.equal(superaLimiteOps(5, 5), true)
  assert.equal(superaLimiteOps(3, 5), false)
})

test('earningsInminente veta abrir si los resultados caen dentro de la ventana', () => {
  assert.equal(earningsInminente('2026-07-20', '2026-07-18', 3), true)   // en 2 días
  assert.equal(earningsInminente('2026-07-25', '2026-07-18', 3), false)  // en 7 días
  assert.equal(earningsInminente('2026-07-15', '2026-07-18', 3), false)  // ya pasaron
  assert.equal(earningsInminente(undefined, '2026-07-18', 3), false)     // sin fecha, no veta
})
