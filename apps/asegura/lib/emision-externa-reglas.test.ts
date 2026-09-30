import { test } from 'node:test'
import assert from 'node:assert/strict'
import { coincideCompania } from './emision-externa-reglas.ts'

test('nombre vacío o en blanco NO coincide (ni con nada ni consigo mismo)', () => {
  assert.equal(coincideCompania('', 'Allianz'), false)
  assert.equal(coincideCompania('Allianz', ''), false)
  assert.equal(coincideCompania('  ', 'Allianz'), false)
  assert.equal(coincideCompania('Allianz', '   '), false)
  assert.equal(coincideCompania('', ''), false)
})

test('Allianz vs Allianz Seguros coincide, en los dos sentidos y sin mayúsculas', () => {
  assert.equal(coincideCompania('Allianz', 'Allianz Seguros'), true)
  assert.equal(coincideCompania('Allianz Seguros', 'allianz'), true)
})

test('compañías distintas no coinciden', () => {
  assert.equal(coincideCompania('Reale', 'Allianz'), false)
})
