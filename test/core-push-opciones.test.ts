// Opciones de entrega de `sendWebPush` (core-push): sin opciones, el envío es IDÉNTICO al de siempre
// (los demás consumidores: ialimp, sivra, ia-rest). Prueba la traducción pura, sin red.
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { opcionesDeEnvio } from '../packages/core-push/src/web-push.ts'

test('sin opciones no se pasa nada a web-push (comportamiento actual)', () => {
  assert.equal(opcionesDeEnvio(undefined), undefined)
  assert.equal(opcionesDeEnvio({}), undefined)
})

test('solo viaja lo informado: lo demás conserva el defecto de la librería', () => {
  assert.deepEqual(opcionesDeEnvio({ ttl: 3600 }), { TTL: 3600 })
  assert.deepEqual(opcionesDeEnvio({ topic: 'abc' }), { topic: 'abc' })
  assert.deepEqual(opcionesDeEnvio({ urgency: 'high' }), { urgency: 'high' })
})

test('ttl 0 se respeta (no se confunde con «sin ttl»)', () => {
  assert.deepEqual(opcionesDeEnvio({ ttl: 0 }), { TTL: 0 })
})

test('las tres juntas', () => {
  assert.deepEqual(opcionesDeEnvio({ ttl: 172800, urgency: 'normal', topic: 'x_y-z' }), {
    TTL: 172800,
    urgency: 'normal',
    topic: 'x_y-z',
  })
})

test('sendWebPush acepta las opciones como 4.º argumento opcional y las pasa traducidas', async () => {
  const { readFileSync } = await import('node:fs')
  const src = readFileSync(new URL('../packages/core-push/src/web-push.ts', import.meta.url), 'utf8')
  assert.match(src, /options\?: SendPushOptions/)
  assert.match(src, /sendNotification\(subscription, body, opcionesDeEnvio\(options\)\)/)
})
