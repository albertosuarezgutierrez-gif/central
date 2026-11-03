// Botones 📑 de la regularización de RC (rrc_env / rrc_mod / rrc_no, 03/11/2026): solo el titular, bien formados y cableados.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { PREFIJO_RRC, decidirBotonRrc, idDeEdicionRrc, lineaTrasPulsarRrc, textoPedirEdicionRrc } from './regularizacion-rc-asegura.ts'

const ID = '3f2a1c4e-5b6d-4e7f-8a9b-0c1d2e3f4a5b'

test('🚨 solo pulsa el titular (from.id exacto); sin chat configurado, nadie; versión obligatoria', () => {
  assert.equal(decidirBotonRrc({ from: { id: 999 } }, 'env', [ID, '1'], '123').ok, false)
  assert.equal(decidirBotonRrc({ from: { id: 123 } }, 'env', [ID, '1'], undefined).ok, false)
  assert.deepEqual(decidirBotonRrc({ from: { id: 123 } }, 'env', [ID, '2'], '123'), { ok: true, accion: 'env', id: ID, version: 2 })
  assert.equal(decidirBotonRrc({ from: { id: 123 } }, 'env', [ID], '123').ok, false, 'sin versión no hay ✅')
  assert.equal(decidirBotonRrc({ from: { id: 123 } }, 'enviar', [ID, '1'], '123').ok, false)
  assert.equal(decidirBotonRrc({ from: { id: 123 } }, 'no', ['x', '1'], '123').ok, false)
})

test('el prefijo es el mismo que emite asegura y el webhook comprueba al titular ANTES de llamar a asegura', () => {
  const tg = readFileSync(new URL('../../asegura/lib/regularizacion-rc-telegram.ts', import.meta.url), 'utf8')
  assert.match(tg, new RegExp(`PREFIJO_RRC = '${PREFIJO_RRC}'`))
  const webhook = readFileSync(new URL('../app/api/sivra/mensajes/telegram-webhook/route.ts', import.meta.url), 'utf8')
  const rama = webhook.slice(webhook.indexOf('if (prefix === PREFIJO_RRC)'))
  const comprueba = rama.indexOf('decidirBotonRrc(cb, action, args, process.env.TELEGRAM_CHAT_ID)')
  assert.ok(comprueba >= 0 && comprueba < rama.indexOf('decidirRrcEnAsegura('))
  // La respuesta de texto (✏️) también exige el chat autorizado antes de editar en asegura.
  const resp = webhook.slice(webhook.indexOf('const rrcEdit = idDeEdicionRrc('))
  assert.ok(resp.indexOf("String(msg.from?.id ?? '') === String(process.env.TELEGRAM_CHAT_ID ?? '')") < resp.indexOf('editarRrcEnAsegura('))
})

test('✏️: la marca liga la respuesta a su solicitud y nada más', () => {
  assert.equal(idDeEdicionRrc(textoPedirEdicionRrc(ID)), ID)
  assert.equal(idDeEdicionRrc('otra cosa [rrc 123]'), null)
  assert.equal(idDeEdicionRrc(null), null)
})

test('la línea tras pulsar no afirma un envío que no consta; 503 ≠ 502', () => {
  assert.match(lineaTrasPulsarRrc('enviada'), /enviado/)
  assert.doesNotMatch(lineaTrasPulsarRrc('HTTP 500'), /enviado al cliente/)
  assert.doesNotMatch(lineaTrasPulsarRrc('<b>x'), /<b>/)
  assert.notEqual(lineaTrasPulsarRrc('canal_no_disponible'), lineaTrasPulsarRrc('envio_fallido'))
  assert.match(lineaTrasPulsarRrc('canal_no_disponible'), /NO ha salido/)
})
