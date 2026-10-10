import test from 'node:test'
import assert from 'node:assert/strict'
import { esColumnaAusente, esTablaAusente } from './pg-error.ts'

test('columna ausente: código 42703 o mensaje de Postgres', () => {
  assert.equal(esColumnaAusente({ code: 'P2010', meta: { code: '42703', message: 'column "excluido_motivo" does not exist' } }), true)
  assert.equal(esColumnaAusente(new Error('column "excluido_motivo" does not exist')), true)
})
test('cualquier otro error NO es columna ausente (se propaga)', () => {
  assert.equal(esColumnaAusente(new Error('connection terminated')), false)
  assert.equal(esColumnaAusente({ meta: { code: '57014' } }), false)
  assert.equal(esColumnaAusente(null), false)
})

test('tabla ausente (mig 0108 sin aplicar): código 42P01 o mensaje de Postgres', () => {
  assert.equal(esTablaAusente({ code: 'P2010', meta: { code: '42P01', message: 'relation "poliza_no_duplicado" does not exist' } }), true)
  assert.equal(esTablaAusente(new Error('relation "public.poliza_no_duplicado" does not exist')), true)
})
test('🚨 una COLUMNA ausente o cualquier otro error NO es tabla ausente', () => {
  assert.equal(esTablaAusente(new Error('column "motivo" of relation "poliza_no_duplicado" does not exist')), false)
  assert.equal(esTablaAusente({ meta: { code: '42703' } }), false)
  assert.equal(esTablaAusente(new Error('permission denied for table poliza_no_duplicado')), false)
  assert.equal(esTablaAusente(null), false)
})
