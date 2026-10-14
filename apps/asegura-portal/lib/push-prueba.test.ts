import { test } from 'node:test'
import assert from 'node:assert/strict'

import { PAYLOAD_PRUEBA, respuestaDePrueba } from './push-prueba.ts'

test('respuestaDePrueba: cuenta enviados y fallidos', () => {
  assert.deepEqual(respuestaDePrueba([{ ok: true }, { ok: false }]), { status: 200, cuerpo: { enviados: 1, fallidos: 1 } })
  assert.deepEqual(respuestaDePrueba([{ ok: true }]), { status: 200, cuerpo: { enviados: 1, fallidos: 0 } })
})

test('respuestaDePrueba: si ninguno se acepta es 502, no un 200 fingido', () => {
  assert.deepEqual(respuestaDePrueba([{ ok: false }, { ok: false }]), {
    status: 502,
    cuerpo: { error: 'envio_fallido', enviados: 0, fallidos: 2 },
  })
})

test('el payload de prueba es fijo y apunta a /configuracion', () => {
  assert.equal(PAYLOAD_PRUEBA.data.url, '/configuracion')
  assert.ok(!/\d{4,}|@/.test(PAYLOAD_PRUEBA.body))
})
