// node --test apps/plataforma/lib/iarest-port.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { iarestErrorPayload } from './iarest-port-core.ts'

test('res null → 502 mencionando la config de plataforma', async () => {
  const r = await iarestErrorPayload(null)
  assert.equal(r.status, 502)
  assert.match(r.error, /sin conexión/i)
  assert.match(r.error, /OPERADOR_SHARED_SECRET/)
})

test('401 de ia-rest → 502 con mensaje de credencial (NO 401)', async () => {
  const r = await iarestErrorPayload(new Response('{}', { status: 401 }))
  assert.equal(r.status, 502)
  assert.match(r.error, /rechazó la credencial/i)
  assert.match(r.error, /MISMO valor/)
})

test('403 de ia-rest → 502 con mensaje de credencial', async () => {
  const r = await iarestErrorPayload(new Response('{}', { status: 403 }))
  assert.equal(r.status, 502)
  assert.match(r.error, /rechazó la credencial/i)
})

test('500 con cuerpo {error} → 502 preservando el mensaje de ia-rest', async () => {
  const r = await iarestErrorPayload(new Response(JSON.stringify({ error: 'boom en supabase' }), { status: 500 }))
  assert.equal(r.status, 502)
  assert.equal(r.error, 'boom en supabase')
})

test('500 sin cuerpo JSON → 502 con "ia-rest HTTP <status>"', async () => {
  const r = await iarestErrorPayload(new Response('not json', { status: 500 }))
  assert.equal(r.status, 502)
  assert.equal(r.error, 'ia-rest HTTP 500')
})
