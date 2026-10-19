// Relevo del código SMS (19/10/2026). `node --test`, puro. Vistos en ROJO: aceptar el código de otro `from.id`, aceptar 3 o 9
// dígitos, interceptar una respuesta a OTRO mensaje, el código repetido en la respuesta, y un fallo del puerto como «no hay».
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  MARCA_AVISO_CODIGO,
  componerAvisoCodigoSms,
  interpretarEntrega,
  interpretarPeticionesCodigo,
  leerMensajeCodigoSms,
  textoTrasEntrega,
} from './tarificador-codigo-sms-asegura.ts'

const CHAT = '424242'
const ID = '0b6a3a43-6a3a-4a43-8a3a-0b6a3a436a3a'
const P = { id: ID, ref: '0b6a3a43', compania: 'generali', ramo: 'auto', caducaEn: '2026-10-19T08:40:00.000Z' }
const aviso = componerAvisoCodigoSms(P).replace(/<[^>]+>/g, '') // Telegram devuelve el texto citado SIN el HTML
const de = (text: string, o: { from?: string; chat?: string; citado?: string } = {}) => ({
  text, from: { id: o.from ?? CHAT }, chat: { id: o.chat ?? CHAT }, ...(o.citado !== undefined ? { reply_to_message: { text: o.citado } } : {}),
})

test('el aviso dice lo que pidió Alberto, con ref y hora; nada del cliente', () => {
  assert.equal(componerAvisoCodigoSms(P), '🔐 Generali pide el código SMS que te acaba de llegar: respóndeme con el código\n<i>presupuesto de auto · ref 0b6a3a43 · vale hasta las 10:40</i>')
  assert.ok(aviso.includes(MARCA_AVISO_CODIGO))
  assert.ok(!componerAvisoCodigoSms(P).includes(ID), 'el id entero del trabajo/petición no sale')
  assert.ok(componerAvisoCodigoSms({ ...P, compania: '<b>x' }).includes('&lt;b&gt;x'))
})

test('respuesta al aviso → código con su ref; /sms → sin ref; número solo → sin ref', () => {
  assert.deepEqual(leerMensajeCodigoSms(de(' 482913 ', { citado: aviso }), CHAT), { tipo: 'codigo', ref: '0b6a3a43', codigo: '482913', forma: 'respuesta' })
  assert.deepEqual(leerMensajeCodigoSms(de('/sms 482913'), CHAT), { tipo: 'codigo', ref: null, codigo: '482913', forma: 'comando' })
  assert.deepEqual(leerMensajeCodigoSms(de('/codigo@bot 1234'), CHAT), { tipo: 'codigo', ref: null, codigo: '1234', forma: 'comando' })
  assert.deepEqual(leerMensajeCodigoSms(de('48291312'), CHAT), { tipo: 'codigo', ref: null, codigo: '48291312', forma: 'numero' })
})

test('SOLO de TELEGRAM_CHAT_ID (from Y chat); sin chat configurado, nadie', () => {
  // Número suelto de otro chat: no es de este flujo (sigue su camino; el bot es compartido).
  assert.deepEqual(leerMensajeCodigoSms(de('482913', { from: '999' }), CHAT), { tipo: 'no_es' })
  assert.deepEqual(leerMensajeCodigoSms(de('482913', { chat: '999' }), CHAT), { tipo: 'no_es' })
  // Respuesta al aviso o comando desde otro chat: se descarta en silencio.
  assert.deepEqual(leerMensajeCodigoSms(de('482913', { from: '999', citado: aviso }), CHAT), { tipo: 'ignorar' })
  assert.deepEqual(leerMensajeCodigoSms(de('/sms 482913', { chat: '999' }), CHAT), { tipo: 'ignorar' })
  assert.deepEqual(leerMensajeCodigoSms(de('/sms 482913', { citado: aviso }), undefined), { tipo: 'ignorar' })
})

test('solo 4-8 dígitos; lo demás en respuesta al aviso es «invalido» (y no se va a otro flujo)', () => {
  for (const t of ['123', '123456789', '48 29 13', 'el código es 482913', '/sms', '/sms abc']) {
    const r = leerMensajeCodigoSms(de(t, { citado: aviso }), CHAT)
    assert.equal(r.tipo, 'invalido', t)
  }
  assert.equal(leerMensajeCodigoSms(de('/sms 123'), CHAT).tipo, 'invalido')
})

test('lo que no es un código sigue su camino: texto suelto, respuesta a OTRO mensaje, nada', () => {
  assert.deepEqual(leerMensajeCodigoSms(de('hola'), CHAT), { tipo: 'no_es' })
  assert.deepEqual(leerMensajeCodigoSms(de('41003', { citado: '🛡️ ¿Qué código postal tiene?' }), CHAT), { tipo: 'no_es' })
  assert.deepEqual(leerMensajeCodigoSms(de('123'), CHAT), { tipo: 'no_es' })
  assert.deepEqual(leerMensajeCodigoSms(null, CHAT), { tipo: 'no_es' })
  assert.deepEqual(leerMensajeCodigoSms({ from: { id: CHAT } }, CHAT), { tipo: 'no_es' })
})

test('ninguna respuesta del bot repite el código', () => {
  const casos = [
    interpretarEntrega(200, { estado: 'entregado', compania: 'generali', codigo: '482913' }),
    interpretarEntrega(200, { estado: 'varias', n: 2 }),
    interpretarEntrega(200, { estado: 'caducada' }),
    interpretarEntrega(503, { estado: 'error', mensaje: '482913' }),
  ]
  for (const r of casos) assert.ok(!textoTrasEntrega(r).includes('482913'), textoTrasEntrega(r))
  assert.match(textoTrasEntrega(casos[0]!), /^✅ Código entregado al bot de Generali/)
  assert.equal(interpretarEntrega(503, { estado: 'codigo_sms_sin_activar' }).estado, 'error')
})

test('un fallo del puerto NO es «no hay peticiones»; las filas raras se cuentan', () => {
  for (const [s, j] of [[401, null], [404, null], [500, { estado: 'error', causa: 'x' }], [200, { estado: 'ok' }], [200, null]] as const) {
    assert.equal(interpretarPeticionesCodigo(s, j).estado, 'error', `status ${s}`)
  }
  assert.equal(interpretarPeticionesCodigo(503, { estado: 'codigo_sms_sin_activar' }).estado, 'sin_esquema')
  const r = interpretarPeticionesCodigo(200, { estado: 'ok', pendientes: [P, { ...P, id: 'x' }, { ...P, ref: 'ZZ' }] })
  assert.equal(r.estado, 'ok')
  if (r.estado === 'ok') {
    assert.deepEqual(r.pendientes, [P])
    assert.equal(r.ilegibles, 2)
  }
})

test('cepo de forma: el webhook mira el código ANTES que cualquier otro flujo y nunca lo loguea', () => {
  const raiz = join(import.meta.dirname, '..')
  const wh = readFileSync(join(raiz, 'app/api/sivra/mensajes/telegram-webhook/route.ts'), 'utf8')
  const cuerpo = wh.slice(wh.indexOf('async function procesarUpdate('))
  const iSms = cuerpo.indexOf('leerMensajeCodigoSms(body.message')
  assert.ok(iSms > 0, 'falta la interceptación del código')
  for (const otro of ['esInstagram', 'callback_query', 'reply_to_message', 'enrutarTextoLibre(']) {
    const i = cuerpo.indexOf(otro)
    assert.ok(i < 0 || i > iSms, `«${otro}» va antes que el código SMS`)
  }
  for (const f of ['app/api/sivra/mensajes/telegram-webhook/route.ts', 'app/api/cron/tarificador-codigo-sms/route.ts', 'lib/tarificador-codigo-sms-asegura.ts']) {
    for (const l of readFileSync(join(raiz, f), 'utf8').split('\n').filter((x) => /console\./.test(x))) assert.ok(!/sms\.|codigo\b/.test(l.replace(/codigo-sms/g, '')), `${f}: ${l.trim()}`)
  }
})
