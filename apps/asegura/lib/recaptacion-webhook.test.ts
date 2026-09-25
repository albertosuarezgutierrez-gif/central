import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Webhook } from 'svix'
import { interpretarEventoResend, verificarWebhookResend } from './recaptacion-webhook.ts'

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

test('🚨 un cuerpo con firma válida devuelve el payload PARSEADO (svix ≥2.5 verify devuelve void)', () => {
  const secreto = 'whsec_' + Buffer.from('0123456789abcdef0123456789abcdef').toString('base64')
  const antes = process.env.RESEND_WEBHOOK_SECRET
  process.env.RESEND_WEBHOOK_SECRET = secreto
  try {
    const cuerpo = JSON.stringify({ type: 'email.delivered', created_at: '2026-09-25T16:00:10Z', data: { email_id: 'abc' } })
    const ts = new Date()
    const firma = new Webhook(secreto).sign('msg_1', ts, cuerpo)
    const r = verificarWebhookResend(cuerpo, { 'svix-id': 'msg_1', 'svix-timestamp': String(Math.floor(ts.getTime() / 1000)), 'svix-signature': firma })
    assert.equal(r.ok, true)
    assert.deepEqual(r.ok && r.payload, JSON.parse(cuerpo))
    const mala = verificarWebhookResend(cuerpo, { 'svix-id': 'msg_1', 'svix-timestamp': String(Math.floor(ts.getTime() / 1000)), 'svix-signature': 'v1,AAAA' })
    assert.equal(mala.ok, false)
  } finally {
    if (antes === undefined) delete process.env.RESEND_WEBHOOK_SECRET
    else process.env.RESEND_WEBHOOK_SECRET = antes
  }
})
