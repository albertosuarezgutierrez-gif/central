import test from 'node:test'
import assert from 'node:assert/strict'
import { esColumnaAusente } from './pg-error.ts'

test('columna ausente: código 42703 o mensaje de Postgres', () => {
  assert.equal(esColumnaAusente({ code: 'P2010', meta: { code: '42703', message: 'column "excluido_motivo" does not exist' } }), true)
  assert.equal(esColumnaAusente(new Error('column "excluido_motivo" does not exist')), true)
})
test('cualquier otro error NO es columna ausente (se propaga)', () => {
  assert.equal(esColumnaAusente(new Error('connection terminated')), false)
  assert.equal(esColumnaAusente({ meta: { code: '57014' } }), false)
  assert.equal(esColumnaAusente(null), false)
})
