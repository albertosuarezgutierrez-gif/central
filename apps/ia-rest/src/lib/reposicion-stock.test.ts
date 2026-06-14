// Tests de la lógica PURA de reposición de stock. Runner: `node --test` (type-stripping).
import { test } from 'node:test'
import assert from 'node:assert/strict'

import { faltante, costeReposicion, formatAvisoStock, type MaterialBajo } from './reposicion-stock.ts'

const bajos: MaterialBajo[] = [
  { nombre: 'Copas vino', cantidad_disponible: 4, stock_minimo: 12, proveedor_nombre: 'Cristalería X', coste_reposicion: 2 },
  { nombre: 'Manteles', cantidad_disponible: 9, stock_minimo: 10, proveedor_nombre: null, coste_reposicion: 5 },
]

test('faltante nunca es negativo', () => {
  assert.equal(faltante({ cantidad_disponible: 4, stock_minimo: 12 }), 8)
  assert.equal(faltante({ cantidad_disponible: 20, stock_minimo: 10 }), 0)
})

test('costeReposicion suma faltante × coste', () => {
  // copas: 8×2=16 ; manteles: 1×5=5 → 21
  assert.equal(costeReposicion(bajos), 21)
})

test('formatAvisoStock: cabecera, líneas ordenadas por faltante y proveedor', () => {
  const msg = formatAvisoStock(bajos)
  assert.match(msg, /2 material/)
  assert.match(msg, /Copas vino: 4\/12 \(faltan 8\)/)
  assert.match(msg, /pedir a Cristalería X/)
  assert.match(msg, /Manteles: 9\/10 \(faltan 1\)/)
  // copas (faltan 8) va antes que manteles (faltan 1)
  assert.ok(msg.indexOf('Copas vino') < msg.indexOf('Manteles'))
  assert.match(msg, /Reposición estimada/)
})
