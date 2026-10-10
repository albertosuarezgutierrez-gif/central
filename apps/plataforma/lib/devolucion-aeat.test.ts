import { test } from 'node:test'
import assert from 'node:assert/strict'
import { esDevolucionAeat } from './devolucion-aeat.ts'

test('esDevolucionAeat exige abono y concepto del fisco', () => {
  assert.equal(esDevolucionAeat('TRANSFERENCIA AEAT DEVOLUCION IRPF 2025', 700), true)
  assert.equal(esDevolucionAeat('PAGO AEAT MODELO 303', -700), false)
  assert.equal(esDevolucionAeat('LA HACIENDA GOLF', 50), false)
})
