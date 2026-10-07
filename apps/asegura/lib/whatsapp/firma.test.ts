import { test } from 'node:test'
import assert from 'node:assert/strict'

import { firmarCuerpo, verificarFirmaMeta, verificarSuscripcion } from './firma.ts'
import { diasRetencion, iaWhatsappActiva, whatsappActivo } from './config.ts'

const SECRETO = 'app-secret-de-prueba'
const CUERPO = '{"object":"whatsapp_business_account","entry":[]}'

test('firma válida del cuerpo CRUDO → true', () => {
  assert.equal(verificarFirmaMeta(CUERPO, firmarCuerpo(CUERPO, SECRETO), SECRETO), true)
  // Meta manda el hex en minúsculas, pero el prefijo/hex en mayúsculas no cambia el HMAC.
  assert.equal(verificarFirmaMeta(CUERPO, firmarCuerpo(CUERPO, SECRETO).toUpperCase().replace('SHA256=', 'sha256='), SECRETO), true)
})

test('firma inválida → false (otro secreto, sin prefijo, vacía, ausente, sin secreto)', () => {
  assert.equal(verificarFirmaMeta(CUERPO, firmarCuerpo(CUERPO, 'otro'), SECRETO), false)
  assert.equal(verificarFirmaMeta(CUERPO, firmarCuerpo(CUERPO, SECRETO).slice('sha256='.length), SECRETO), false)
  assert.equal(verificarFirmaMeta(CUERPO, 'sha256=', SECRETO), false)
  assert.equal(verificarFirmaMeta(CUERPO, null, SECRETO), false)
  assert.equal(verificarFirmaMeta(CUERPO, firmarCuerpo(CUERPO, SECRETO), ''), false)
  assert.equal(verificarFirmaMeta(CUERPO, firmarCuerpo(CUERPO, SECRETO), undefined), false)
})

test('cuerpo ALTERADO (un byte, o re-serializado) con la firma del original → false', () => {
  const firma = firmarCuerpo(CUERPO, SECRETO)
  assert.equal(verificarFirmaMeta(CUERPO.replace('[]', '[{}]'), firma, SECRETO), false)
  // Re-serializar cambia los bytes: por eso se firma el texto crudo, no el JSON parseado.
  assert.equal(verificarFirmaMeta(JSON.stringify(JSON.parse(CUERPO), null, 1), firma, SECRETO), false)
})

test('handshake GET: challenge solo con modo subscribe y token correcto', () => {
  const p = (q: string) => new URLSearchParams(q)
  assert.deepEqual(verificarSuscripcion(p('hub.mode=subscribe&hub.verify_token=tok&hub.challenge=123'), 'tok'), { ok: true, challenge: '123' })
  assert.deepEqual(verificarSuscripcion(p('hub.mode=subscribe&hub.verify_token=mal&hub.challenge=123'), 'tok'), { ok: false })
  assert.deepEqual(verificarSuscripcion(p('hub.mode=unsubscribe&hub.verify_token=tok&hub.challenge=123'), 'tok'), { ok: false })
  assert.deepEqual(verificarSuscripcion(p('hub.mode=subscribe&hub.verify_token=tok'), 'tok'), { ok: false })
  // Sin token configurado no se verifica a nadie (tampoco con token vacío).
  assert.deepEqual(verificarSuscripcion(p('hub.mode=subscribe&hub.verify_token=&hub.challenge=1'), ''), { ok: false })
})

test('flags: solo «1» enciende; retención por defecto 730 y un valor raro NO purga', () => {
  assert.equal(whatsappActivo({}), false)
  assert.equal(whatsappActivo({ ASEGURA_WHATSAPP_ACTIVO: 'true' }), false)
  assert.equal(whatsappActivo({ ASEGURA_WHATSAPP_ACTIVO: '1' }), true)
  assert.equal(iaWhatsappActiva({ ASEGURA_WHATSAPP_IA_ACTIVO: '0' }), false)
  assert.equal(iaWhatsappActiva({ ASEGURA_WHATSAPP_IA_ACTIVO: '1' }), true)
  assert.equal(diasRetencion({}), 730)
  assert.equal(diasRetencion({ WHATSAPP_RETENCION_DIAS: '365' }), 365)
  for (const v of ['0', '7', '-1', 'abc', '1e3']) assert.equal(diasRetencion({ WHATSAPP_RETENCION_DIAS: v }), null, v)
})
