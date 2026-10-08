import { test } from 'node:test'
import assert from 'node:assert/strict'
import { asignarCargos, toleranciaFactura, type CandidatoCargo } from './casar-cargos.ts'

const c = (factura_id: string, movimiento_id: string, dist: number, ratio = 1, tolerancia = 0.03): CandidatoCargo =>
  ({ factura_id, movimiento_id, dist, ratio, tolerancia })

test('Anthropic: 3 facturas de 170€ y 5 cargos de 170€ → las 3 se casan con cargos distintos', () => {
  // Todas las facturas ven todos los cargos; el de menor distancia (m1) lo quieren las tres.
  const cands: CandidatoCargo[] = []
  for (const f of ['f1', 'f2', 'f3']) for (const [i, d] of [[1, 2], [2, 3], [3, 5], [4, 8], [5, 9]]) cands.push(c(f, `m${i}`, d))
  const r = asignarCargos(cands)
  assert.equal(r.length, 3)
  assert.equal(new Set(r.map((x) => x.movimiento_id)).size, 3)
  assert.equal(new Set(r.map((x) => x.factura_id)).size, 3)
})
test('un cargo solo paga UNA factura', () => {
  assert.equal(asignarCargos([c('f1', 'm1', 1), c('f2', 'm1', 1)]).length, 1)
})
test('USD: 106,76 vs 95,44 (ratio 0,894) casa con tolerancia de divisa, no con la de EUR', () => {
  const ratio = 95.44 / 106.76
  assert.equal(asignarCargos([c('f', 'm', 0, ratio, toleranciaFactura('Vercel Inc.', null))]).length, 1)
  assert.equal(asignarCargos([c('f', 'm', 0, ratio, toleranciaFactura('Anthropic', null))]).length, 0)
  assert.equal(asignarCargos([c('f', 'm', 0, ratio, toleranciaFactura('Otro', 'USD'))]).length, 1)
})
test('divisa EUR explícita gana a la heurística del proveedor', () => {
  assert.equal(toleranciaFactura('Vercel', 'EUR'), 0.03)
})
