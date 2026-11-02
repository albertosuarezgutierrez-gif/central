import { test } from 'node:test'
import assert from 'node:assert/strict'
import { autorizaCron, igualSeguro } from './cron-auth.ts'

test('sin CRON_SECRET en producción: deniega', () => {
  assert.equal(autorizaCron({ secret: undefined, bearer: 'undefined', produccion: true }), false)
  assert.equal(autorizaCron({ secret: '', bearer: '', produccion: true }), false)
})

test('sin CRON_SECRET en dev: paso franco', () => {
  assert.equal(autorizaCron({ secret: undefined, produccion: false }), true)
})

test('con secreto: solo el valor exacto', () => {
  assert.equal(autorizaCron({ secret: 's3cr3t', bearer: 's3cr3t', produccion: true }), true)
  assert.equal(autorizaCron({ secret: 's3cr3t', bearer: 's3cr3', produccion: true }), false)
  assert.equal(autorizaCron({ secret: 's3cr3t', bearer: null, produccion: true }), false)
  assert.equal(igualSeguro('', ''), false)
})
