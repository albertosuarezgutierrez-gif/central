import { test } from 'node:test'
import assert from 'node:assert/strict'
import { claveProducto, revisarIpid } from './ipid.ts'

test('🪤 la clave del producto funde mayúsculas, tildes y signos; sin compañía o producto no hay clave', () => {
  assert.equal(claveProducto('Allianz', 'Todo Riesgo'), claveProducto(' ALLIANZ ', 'todo-riesgo'))
  assert.equal(claveProducto('Mapfre', 'Hogar Básico'), 'mapfre|hogar basico')
  assert.equal(claveProducto('Mapfre', ''), null)
  assert.equal(claveProducto(null, 'X'), null)
  assert.notEqual(claveProducto('Allianz', 'Todo Riesgo'), claveProducto('Allianz', 'Terceros'))
})

test('la ficha IPID solo PDF y hasta 4 MB', () => {
  assert.equal(revisarIpid({ type: 'application/pdf', size: 1000 }), null)
  assert.equal(revisarIpid({ type: '', size: 1000, name: 'ipid.PDF' }), null)
  assert.ok(revisarIpid({ type: 'image/png', size: 1000 }))
  assert.ok(revisarIpid({ type: 'application/pdf', size: 5 * 1024 * 1024 }))
  assert.ok(revisarIpid({ type: 'application/pdf', size: 0 }))
})
