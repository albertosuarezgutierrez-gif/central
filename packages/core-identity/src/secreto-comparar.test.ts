import test from 'node:test'
import assert from 'node:assert/strict'
import { secretoCoincide, autorizacionBearerValida } from './secreto-comparar.ts'

test('secretoCoincide: igual acepta, distinto rechaza', () => {
  assert.equal(secretoCoincide('abc123', 'abc123'), true)
  assert.equal(secretoCoincide('abc124', 'abc123'), false)
  assert.equal(secretoCoincide('ABC123', 'abc123'), false)
})

test('secretoCoincide: longitudes distintas (prefijo, extensión, repetición) rechazan', () => {
  assert.equal(secretoCoincide('abc', 'abc123'), false)
  assert.equal(secretoCoincide('abc123x', 'abc123'), false)
  assert.equal(secretoCoincide('abcabc', 'abc'), false) // el módulo no debe colar una repetición
})

test('secretoCoincide: esperado vacío o ausente es fail-closed', () => {
  assert.equal(secretoCoincide('', ''), false)
  assert.equal(secretoCoincide('x', ''), false)
  assert.equal(secretoCoincide('x', undefined), false)
  assert.equal(secretoCoincide(undefined, undefined), false)
  assert.equal(secretoCoincide('undefined', undefined), false)
})

test('secretoCoincide: recibido null/undefined/vacío rechaza', () => {
  assert.equal(secretoCoincide(null, 'abc'), false)
  assert.equal(secretoCoincide(undefined, 'abc'), false)
  assert.equal(secretoCoincide('', 'abc'), false)
})

test('autorizacionBearerValida: Request, Headers y valor suelto', () => {
  const env = { MI_SECRETO: 's3cr3t' }
  assert.equal(autorizacionBearerValida(new Request('http://x', { headers: { authorization: 'Bearer s3cr3t' } }), 'MI_SECRETO', env), true)
  assert.equal(autorizacionBearerValida(new Headers({ authorization: 'Bearer s3cr3t' }), 'MI_SECRETO', env), true)
  assert.equal(autorizacionBearerValida('Bearer s3cr3t', 'MI_SECRETO', env), true)
  assert.equal(autorizacionBearerValida('Bearer otro', 'MI_SECRETO', env), false)
  assert.equal(autorizacionBearerValida('s3cr3t', 'MI_SECRETO', env), false) // sin esquema Bearer
  assert.equal(autorizacionBearerValida(new Request('http://x'), 'MI_SECRETO', env), false)
  assert.equal(autorizacionBearerValida(null, 'MI_SECRETO', env), false)
})

test('autorizacionBearerValida: env ausente o vacía no autoriza ni «Bearer undefined»', () => {
  assert.equal(autorizacionBearerValida('Bearer undefined', 'NO_EXISTE', {}), false)
  assert.equal(autorizacionBearerValida('Bearer ', 'VACIA', { VACIA: '' }), false)
  assert.equal(autorizacionBearerValida('Bearer x', 'VACIA', { VACIA: '' }), false)
})
