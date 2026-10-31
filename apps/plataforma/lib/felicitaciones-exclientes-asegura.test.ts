// Botón 🎂 de la felicitación a ex-clientes (fex_ok / fex_no): solo el titular, botón bien formado y cableado.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { PREFIJO_FEX, decidirBotonFex, lineaTrasPulsarFex } from './felicitaciones-exclientes-asegura.ts'

const ID = '3f2a1c4e-5b6d-4e7f-8a9b-0c1d2e3f4a5b'

test('🚨 solo pulsa el titular (from.id exacto); sin chat configurado, nadie', () => {
  assert.equal(decidirBotonFex({ from: { id: 999 } }, 'ok', [ID, '2026'], '123').ok, false)
  assert.equal(decidirBotonFex({ from: { id: 123 } }, 'ok', [ID, '2026'], undefined).ok, false)
  assert.deepEqual(decidirBotonFex({ from: { id: 123 } }, 'ok', [ID, '2026'], '123'), { ok: true, decision: 'ok', clienteId: ID, anio: 2026 })
  assert.equal(decidirBotonFex({ from: { id: 123 } }, 'si', [ID, '2026'], '123').ok, false)
  assert.equal(decidirBotonFex({ from: { id: 123 } }, 'no', ['x', '2026'], '123').ok, false)
})

test('el prefijo es el mismo que emite asegura y el webhook lo enruta', () => {
  const reglas = readFileSync(new URL('../../asegura/lib/felicitaciones-exclientes-reglas.ts', import.meta.url), 'utf8')
  assert.match(reglas, new RegExp(`PREFIJO_FEX = '${PREFIJO_FEX}'`))
  const webhook = readFileSync(new URL('../app/api/sivra/mensajes/telegram-webhook/route.ts', import.meta.url), 'utf8')
  const rama = webhook.slice(webhook.indexOf('if (prefix === PREFIJO_FEX)'))
  assert.ok(rama.indexOf('decidirBotonFex(cb, action, args, process.env.TELEGRAM_CHAT_ID)') < rama.indexOf('decidirFexEnAsegura('))
})

test('la línea tras pulsar no afirma un envío que no consta', () => {
  assert.match(lineaTrasPulsarFex('ok', 'enviada'), /enviada/)
  assert.doesNotMatch(lineaTrasPulsarFex('ok', 'HTTP 500'), /enviada\./)
  assert.match(lineaTrasPulsarFex('ok', 'puerta_cerrada'), /apagada/)
})
