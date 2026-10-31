// Runner: `node --test lib/fiscal-compras.test.ts`
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { normalizarCompra } from './fiscal-compras.ts'

const ok = { importe: '1.200,50', propertyId: 'prop_house_sevillana', tipo: 'reparacion' }
test('importe en formato español y tipo válido', () => {
  const r = normalizarCompra(ok)
  assert.ok(r.ok && r.valor.importe === 1200.5 && r.valor.tipo === 'reparacion' && r.valor.fechaPrevista === null)
})
test('tipo vacío = sin clasificar (null), nunca un valor por defecto', () => {
  const r = normalizarCompra({ ...ok, tipo: '' })
  assert.ok(r.ok && r.valor.tipo === null)
})
test('rechaza importe 0/negativo/NaN, piso inválido, tipo desconocido y fecha mala', () => {
  for (const mal of [{ importe: 0 }, { importe: -5 }, { importe: 'abc' }, { propertyId: "prop_x'; DROP" }, { tipo: 'lujo' }, { fechaPrevista: '31/12/2026' }]) {
    assert.equal(normalizarCompra({ ...ok, ...mal }).ok, false, JSON.stringify(mal))
  }
})
