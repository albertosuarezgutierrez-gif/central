import test from 'node:test'
import assert from 'node:assert/strict'
import { COSTE_LECTURA_FACTURA_EUR, COSTE_LECTURA_VOLCADO_EUR, costeEstimadoIa } from './patrimonio-coste-ia.ts'

test('coste = facturas × precio factura + volcados × precio volcado', () => {
  const c = costeEstimadoIa({ facturas: 10, volcados: 2 })
  assert.deepEqual(c, { euros: Math.round((10 * COSTE_LECTURA_FACTURA_EUR + 2 * COSTE_LECTURA_VOLCADO_EUR) * 100) / 100, esSuelo: false })
})

test('0 lecturas es 0,00 € revisado, no «sin dato»', () => {
  assert.deepEqual(costeEstimadoIa({ facturas: 0, volcados: 0 }), { euros: 0, esSuelo: false })
})

test('volcados desconocidos (null) = SUELO, no se cuentan como 0 limpio', () => {
  const c = costeEstimadoIa({ facturas: 3, volcados: null })
  assert.equal(c?.esSuelo, true)
  assert.equal(c?.euros, Math.round(3 * COSTE_LECTURA_FACTURA_EUR * 100) / 100)
})

test('facturas inválidas (null/NaN/negativo) = sin dato', () => {
  for (const f of [null, NaN, -1, 1.5, undefined]) {
    assert.equal(costeEstimadoIa({ facturas: f as unknown as number, volcados: 0 }), null)
  }
})
