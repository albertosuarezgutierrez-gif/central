// Responder EN EL HILO (19/10/2026): solo con un id de mensaje válido, y sin perder el aviso si el mensaje ya no está.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { respuestaA } from './index.ts'

test('🪤 respuestaA: id válido → reply_parameters que no bloquea el envío; sin id o raro → nada', () => {
  assert.deepEqual(respuestaA(42), { reply_parameters: { message_id: 42, allow_sending_without_reply: true } })
  assert.deepEqual(respuestaA(undefined), {})
  assert.deepEqual(respuestaA(0), {})
  assert.deepEqual(respuestaA(1.5), {})
})
