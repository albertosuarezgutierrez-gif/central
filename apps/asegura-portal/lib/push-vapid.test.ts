import assert from 'node:assert/strict'
import { test } from 'node:test'

import { OPCIONES_AVISO, TTL_AVISO_SEGUNDOS, VAPID_SUBJECT, cargarVapid, topicAviso } from './push-vapid.ts'

const entorno = (vars: Record<string, string>) => (nombre: string) => {
  const v = vars[nombre]
  if (!v) throw new Error(`${nombre} no configurado`)
  return v
}

test('con las dos claves devuelve la config y el subject único', async () => {
  const r = await cargarVapid(entorno({ NEXT_PUBLIC_VAPID_PUBLIC_KEY: 'pub', VAPID_PRIVATE_KEY: 'priv' }))
  assert.deepEqual(r, { ok: true, vapid: { publicKey: 'pub', privateKey: 'priv', subject: VAPID_SUBJECT } })
  assert.match(VAPID_SUBJECT, /^mailto:/)
})

test('🚨 falta la privada → ok:false (el cron responde 503, no manda con clave vacía)', async () => {
  assert.deepEqual(await cargarVapid(entorno({ NEXT_PUBLIC_VAPID_PUBLIC_KEY: 'pub' })), { ok: false })
})

test('🚨 falta la pública → ok:false', async () => {
  assert.deepEqual(await cargarVapid(entorno({ VAPID_PRIVATE_KEY: 'priv' })), { ok: false })
})

test('cargarVapid no lanza aunque el lector lance', async () => {
  const r = await cargarVapid(() => {
    throw new Error('boom')
  })
  assert.equal(r.ok, false)
})

test('TTL 48 h, urgencia normal', () => {
  assert.equal(TTL_AVISO_SEGUNDOS, 172_800)
  assert.deepEqual({ ...OPCIONES_AVISO }, { ttl: 172_800, urgency: 'normal' })
})

test('topicAviso: estable, ≤32, base64url y distinto por aviso', () => {
  const a = topicAviso('obligacion:abc')
  assert.equal(a, topicAviso('obligacion:abc'))
  assert.notEqual(a, topicAviso('obligacion:abd'))
  assert.ok(a.length > 0 && a.length <= 32)
  assert.match(a, /^[A-Za-z0-9_-]+$/)
})
