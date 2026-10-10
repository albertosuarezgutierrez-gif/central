import test from 'node:test'
import assert from 'node:assert/strict'
import { calcularIvaFactura } from './iva.ts'

test('IVA no leído por la IA -> null, nunca 21 ni 0 (Vercel/OpenRouter)', () => {
  for (const v of [undefined, null, 'x', NaN, -1, 250]) {
    assert.deepEqual(calcularIvaFactura(20, v), { ivaPct: null, cuotaIva: null })
  }
})

test('IVA 0 es un dato (exento), no «no leído»', () => {
  assert.deepEqual(calcularIvaFactura(100, 0), { ivaPct: 0, cuotaIva: 0 })
})

test('IVA 21 leído: cuota sobre la base', () => {
  assert.deepEqual(calcularIvaFactura(121, 21), { ivaPct: 21, cuotaIva: 21 })
  assert.equal(calcularIvaFactura(50, 21).cuotaIva, 8.68)
})
