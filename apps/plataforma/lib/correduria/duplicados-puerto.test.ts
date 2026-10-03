import test from 'node:test'
import assert from 'node:assert/strict'
import { interpretarDuplicadosVistos } from '../correduria-puerto.ts'

test('vistos: lista, nunca guardado (null) y lo ilegible como error', () => {
  assert.deepEqual(interpretarDuplicadosVistos(200, { estado: 'ok', claves: ['A1|X'] }), { estado: 'ok', claves: ['A1|X'] })
  assert.deepEqual(interpretarDuplicadosVistos(200, { estado: 'ok', claves: null }), { estado: 'ok', claves: null })
  assert.equal(interpretarDuplicadosVistos(200, { estado: 'ok' }).estado, 'error')
  assert.equal(interpretarDuplicadosVistos(200, { estado: 'ok', claves: [1] }).estado, 'error')
  assert.equal(interpretarDuplicadosVistos(200, { estado: 'error' }).estado, 'error')
  assert.equal(interpretarDuplicadosVistos(401, null).estado, 'error')
  assert.equal(interpretarDuplicadosVistos(200, { estado: 'sin_configurar' }).estado, 'sin_configurar')
})
