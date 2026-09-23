import { test } from 'node:test'
import assert from 'node:assert'
import { verifyTelegramWebhook, emisorAutorizado } from './index.ts'

test('webhook: sin secreto configurado NO se acepta nada (fail-closed)', () => {
  assert.equal(verifyTelegramWebhook('lo-que-sea', ''), false)
  assert.equal(verifyTelegramWebhook(null, undefined), false)
})

test('webhook: exige el header exacto', () => {
  assert.equal(verifyTelegramWebhook('s3cr3t', 's3cr3t'), true)
  assert.equal(verifyTelegramWebhook('s3cr3T', 's3cr3t'), false)
  assert.equal(verifyTelegramWebhook(null, 's3cr3t'), false)
  assert.equal(verifyTelegramWebhook('s3cr3t-mas', 's3cr3t'), false)
})

test('emisor: el botón pulsado en el chat de Alberto pasa; en otro chat no', () => {
  assert.equal(emisorAutorizado({ callback_query: { message: { chat: { id: 111 } } } }, '111'), true)
  assert.equal(emisorAutorizado({ callback_query: { message: { chat: { id: 999 } } } }, '111'), false)
})

test('emisor: callback sin mensaje se juzga por quién lo pulsó', () => {
  assert.equal(emisorAutorizado({ callback_query: { from: { id: 111 } } }, '111'), true)
  assert.equal(emisorAutorizado({ callback_query: { from: { id: 222 } } }, '111'), false)
})

test('emisor: mensajes de texto, por el chat', () => {
  assert.equal(emisorAutorizado({ message: { chat: { id: 111 } } }, '111'), true)
  assert.equal(emisorAutorizado({ message: { chat: { id: 5 } } }, '111'), false)
})

test('emisor: sin chat permitido o sin chat reconocible → no', () => {
  assert.equal(emisorAutorizado({ message: { chat: { id: 111 } } }, ''), false)
  assert.equal(emisorAutorizado({}, '111'), false)
})
