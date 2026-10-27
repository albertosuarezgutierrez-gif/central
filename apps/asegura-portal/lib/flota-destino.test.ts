import { test } from 'node:test'
import assert from 'node:assert/strict'

import { destinoFlota } from './flota-destino.ts'

test('destinoFlota: UNA sociedad y nada pendiente salta directo a su flota', () => {
  assert.equal(destinoFlota([{ id: 'abc' }], 0), '/flota?empresa=abc')
})

test('destinoFlota: el id viaja codificado', () => {
  assert.equal(destinoFlota([{ id: 'a b&c' }], 0), '/flota?empresa=a%20b%26c')
})

test('destinoFlota: varias sociedades, ninguna o un nombramiento pendiente van al índice', () => {
  assert.equal(destinoFlota([{ id: 'a' }, { id: 'b' }], 0), '/flota')
  assert.equal(destinoFlota([], 0), '/flota')
  assert.equal(destinoFlota([{ id: 'a' }], 1), '/flota')
})

test('destinoFlota: lo que no se pudo contar (null) NO salta directo', () => {
  assert.equal(destinoFlota(null, 0), '/flota')
  assert.equal(destinoFlota([{ id: 'a' }], null), '/flota')
})
