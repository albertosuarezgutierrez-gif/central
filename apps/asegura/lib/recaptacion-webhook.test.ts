import { test } from 'node:test'
import assert from 'node:assert/strict'
import { interpretarEventoResend } from './recaptacion-webhook.ts'

test('un evento email.opened con message_id conocido se traduce a estado abierto', () => {
  const r = interpretarEventoResend({ type: 'email.opened', data: { email_id: 'abc123' } })
  assert.deepEqual(r, { resendMessageId: 'abc123', estado: 'abierto' })
})

test('un evento email.clicked se traduce a pinchado', () => {
  const r = interpretarEventoResend({ type: 'email.clicked', data: { email_id: 'abc123' } })
  assert.deepEqual(r, { resendMessageId: 'abc123', estado: 'pinchado' })
})

test('un tipo de evento que no interesa (delivered, bounced...) no produce ninguna actualización', () => {
  const r = interpretarEventoResend({ type: 'email.delivered', data: { email_id: 'abc123' } })
  assert.equal(r, null)
})

test('un payload sin email_id no produce ninguna actualización', () => {
  const r = interpretarEventoResend({ type: 'email.opened', data: {} })
  assert.equal(r, null)
})
