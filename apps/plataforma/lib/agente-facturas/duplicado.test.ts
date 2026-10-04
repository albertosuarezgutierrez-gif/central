import test from 'node:test'
import assert from 'node:assert/strict'
import { mismoGastoPorHuella as m } from './duplicado.ts'

const base = { proveedor: 'Occident', fecha: '2026-09-10', total: 2032.71 }

test('Occident 2.032,71 vs 2.032,72 el mismo día = duplicado', () => {
  assert.equal(m(base, { ...base, total: 2032.72 }), true)
})
test('Fundación 120 x2 el mismo día = duplicado', () => {
  const f = { proveedor: 'Fundación X', fecha: '2026-09-01', total: 120 }
  assert.equal(m(f, { ...f }), true)
})
test('307,11 con proveedor NULL vs nombre = duplicado', () => {
  const a = { proveedor: null, fecha: '2026-09-02', total: 307.11 }
  assert.equal(m(a, { ...a, proveedor: 'Endesa' }), true)
})
test('números distintos = facturas distintas (Anthropic 170 EUR)', () => {
  const a = { proveedor: 'Anthropic', fecha: '2026-09-02', total: 170, numero_factura: 'INV-1' }
  assert.equal(m(a, { ...a, numero_factura: 'INV-2' }), false)
})
test('mismo número, o número solo en uno = se compara por huella', () => {
  const a = { proveedor: 'Anthropic', fecha: '2026-09-02', total: 170, numero_factura: 'INV-1' }
  assert.equal(m(a, { ...a, numero_factura: 'inv 1' }), true)
  assert.equal(m(a, { ...a, numero_factura: null }), true)
})
test('límites: importe >0,02, fecha >3 días, proveedor o NIF distinto = no duplicado', () => {
  assert.equal(m(base, { ...base, total: 2032.74 }), false)
  assert.equal(m(base, { ...base, fecha: '2026-09-14' }), false)
  assert.equal(m(base, { ...base, fecha: '2026-09-13' }), true)
  assert.equal(m(base, { ...base, proveedor: 'Allianz' }), false)
  assert.equal(m({ ...base, nif_proveedor: 'A1' }, { ...base, nif_proveedor: 'B2' }), false)
  assert.equal(m({ ...base, proveedor: 'Occident SA', nif_proveedor: 'A1' }, { ...base, proveedor: 'Otro', nif_proveedor: 'A1' }), true)
})
