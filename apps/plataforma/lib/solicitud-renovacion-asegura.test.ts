import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import { PREFIJO_CDR, decidirBotonCdr, lineaTrasEnviarCdr } from './solicitud-renovacion-asegura.ts'

const S = '22222222-2222-4222-8222-222222222222'

test('✅ de la solicitud de datos: solo el titular exacto, la acción `env` y un uuid', () => {
  assert.equal(decidirBotonCdr({ from: { id: 5 } }, 'env', [S], undefined).ok, false, 'sin chat configurado, nadie')
  assert.equal(decidirBotonCdr({ from: { id: 6 } }, 'env', [S], '5').ok, false)
  assert.equal(decidirBotonCdr({ from: { id: 5 } }, 'env', ['no-uuid'], '5').ok, false)
  assert.equal(decidirBotonCdr({ from: { id: 5 } }, 'emitir', [S], '5').ok, false)
  assert.deepEqual(decidirBotonCdr({ from: { id: 5 } }, 'env', [S.toUpperCase()], '5'), { ok: true, solicitudId: S })
})

test('el prefijo y la acción son los MISMOS que emite asegura (callback_data ≤ 64 bytes)', () => {
  const asegura = readFileSync(new URL('../../asegura/lib/solicitud-renovacion-reglas.ts', import.meta.url), 'utf8')
  assert.match(asegura, new RegExp(`PREFIJO_DATOS_RENOVACION_TG = '${PREFIJO_CDR}'`))
  assert.match(asegura, /CALLBACK_ENVIAR_DATOS = `\$\{PREFIJO_DATOS_RENOVACION_TG\}_env`/)
  assert.ok(Buffer.byteLength(`${PREFIJO_CDR}_env:${S}`) <= 64)
})

test('503 canal_no_disponible ≠ fallo; un estado desconocido NO se pinta como enviado', () => {
  assert.match(lineaTrasEnviarCdr('canal_no_disponible'), /Nadie que pueda contestar/)
  assert.match(lineaTrasEnviarCdr('http_502'), /No sé si se ha enviado/)
  assert.doesNotMatch(lineaTrasEnviarCdr('http_502'), /✅/)
})

test('el webhook enruta `cdr` con la puerta del titular, el mensaje del botón y sin reintentar', () => {
  const ruta = readFileSync(new URL('../app/api/sivra/mensajes/telegram-webhook/route.ts', import.meta.url), 'utf8')
  const i = ruta.indexOf('if (prefix === PREFIJO_CDR)')
  assert.ok(i > 0)
  const tramo = ruta.slice(i, i + 2500)
  assert.match(tramo, /decidirBotonCdr\(cb, action, args, process\.env\.TELEGRAM_CHAT_ID\)/)
  assert.match(tramo, /via: 'telegram', telegramMessageId: mensajeId/)
  assert.equal((tramo.match(/publicarSolicitudRenovacionAsegura\(/g) ?? []).length, 1, 'una sola llamada: no se reintenta')
})

test('«🔁 Reintentar bots» (cdr_bot): solo el titular, solo la acción `bot`, y el webhook lo enruta sin tocar el ✅', async () => {
  const { decidirBotonBotsCdr } = await import('./solicitud-renovacion-asegura.ts')
  assert.equal(decidirBotonBotsCdr({ from: { id: 6 } }, 'bot', [S], '5').ok, false)
  assert.equal(decidirBotonBotsCdr({ from: { id: 5 } }, 'env', [S], '5').ok, false)
  assert.equal(decidirBotonBotsCdr({ from: { id: 5 } }, 'bot', ['x'], '5').ok, false)
  assert.deepEqual(decidirBotonBotsCdr({ from: { id: 5 } }, 'bot', [S], '5'), { ok: true, solicitudId: S })
  const ruta = readFileSync(new URL('../app/api/sivra/mensajes/telegram-webhook/route.ts', import.meta.url), 'utf8')
  assert.match(ruta, /prefix === PREFIJO_CDR && action === 'bot'[\s\S]{0,600}decidirBotonBotsCdr\(/)
  const asegura = readFileSync(new URL('../../asegura/lib/solicitud-renovacion-bots-reglas.ts', import.meta.url), 'utf8')
  assert.match(asegura, /CALLBACK_REINTENTAR_BOTS = 'cdr_bot'/)
})
