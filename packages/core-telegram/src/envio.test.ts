// Las funciones de envío son best-effort: sin TELEGRAM_BOT_TOKEN/CHAT_ID devuelven null
// sin tocar la red ni lanzar (así un entorno sin bot no rompe nada aguas arriba).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { tgSend, tgSendPhoto } from './index.ts'

test('tgSend sin envs devuelve null sin lanzar', async () => {
  delete process.env.TELEGRAM_BOT_TOKEN
  delete process.env.TELEGRAM_CHAT_ID
  assert.equal(await tgSend('hola'), null)
})

test('tgSendPhoto sin envs devuelve null sin lanzar (url y bytes)', async () => {
  delete process.env.TELEGRAM_BOT_TOKEN
  delete process.env.TELEGRAM_CHAT_ID
  assert.equal(await tgSendPhoto({ url: 'https://example.com/x.jpg' }, 'foto'), null)
  assert.equal(await tgSendPhoto({ data: new Uint8Array([1, 2, 3]) }, 'foto'), null)
})
