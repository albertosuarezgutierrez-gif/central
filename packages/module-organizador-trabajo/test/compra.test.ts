import { test } from 'node:test'
import assert from 'node:assert/strict'
import { estimarCompra, aprenderFactor } from '../src/compra.ts'

test('estima compra aplicando el factor de holgura sobre la necesidad', () => {
  // 100 kg de necesidad con +10% de colchón → 110
  assert.equal(estimarCompra(100, 0.1), 110)
})

test('factor 0 → compra exactamente la necesidad', () => {
  assert.equal(estimarCompra(50, 0), 50)
})

test('factor negativo (se compraba de más) reduce el pedido', () => {
  assert.equal(estimarCompra(100, -0.2), 80)
})

test('nunca devuelve negativo', () => {
  assert.equal(estimarCompra(10, -5), 0)
})

test('aprende: si sobró producto, baja el factor (retroalimentación)', () => {
  // estimado 110, real consumido 100 → sobró → el nuevo factor tiende a 0
  const nuevo = aprenderFactor({ estimado: 110, real: 100, factorActual: 0.1, suavizado: 0.5 })
  assert.ok(nuevo < 0.1, `esperaba bajar de 0.1, fue ${nuevo}`)
})

test('aprende: si faltó producto, sube el factor', () => {
  // estimado 100, real 120 → faltó → sube el colchón
  const nuevo = aprenderFactor({ estimado: 100, real: 120, factorActual: 0.1, suavizado: 0.5 })
  assert.ok(nuevo > 0.1, `esperaba subir de 0.1, fue ${nuevo}`)
})

test('aprende: estimado 0 no rompe (devuelve el factor actual)', () => {
  assert.equal(aprenderFactor({ estimado: 0, real: 10, factorActual: 0.1, suavizado: 0.5 }), 0.1)
})

test('aprende: suavizado 1 salta directo al factor que habría cuadrado', () => {
  // estimado 110, real 100: el factor que cuadra es (100/110 del pedido sobre necesidad)
  // necesidad implícita = estimado/(1+factorActual) = 110/1.1 = 100; factor ideal = real/necesidad - 1 = 0
  const nuevo = aprenderFactor({ estimado: 110, real: 100, factorActual: 0.1, suavizado: 1 })
  assert.ok(Math.abs(nuevo - 0) < 1e-9, `esperaba ~0, fue ${nuevo}`)
})
