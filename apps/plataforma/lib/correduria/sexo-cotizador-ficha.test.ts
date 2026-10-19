import { test } from 'node:test'
import assert from 'node:assert/strict'
import { sexoAPersistir } from './sexo-cotizador-ficha.ts'

const FALTA = [{ campo: 'fechaCarnet' }, { campo: 'sexo' }]

test('ficha sin sexo + elección válida → se persiste', () => {
  assert.equal(sexoAPersistir(FALTA, 'hombre'), 'hombre')
  assert.equal(sexoAPersistir(FALTA, ' mujer '), 'mujer')
})

test('ficha CON sexo (no figura en faltan) → nunca se pisa', () => {
  assert.equal(sexoAPersistir([{ campo: 'fechaCarnet' }], 'mujer'), null)
  assert.equal(sexoAPersistir([], 'hombre'), null)
})

test('sin precalificar (null/undefined) = no se sabe → no se escribe', () => {
  assert.equal(sexoAPersistir(null, 'hombre'), null)
  assert.equal(sexoAPersistir(undefined, 'hombre'), null)
})

test('elección vacía o inválida → nada', () => {
  for (const v of ['', ' ', 'otro', null, undefined]) assert.equal(sexoAPersistir(FALTA, v), null, String(v))
})
