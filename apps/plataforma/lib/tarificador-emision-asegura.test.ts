// Cepos de la emisión del robot, lado plataforma (10/10/2026). `node --test`. Sin datos personales.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { parseCallback } from '@central/core-telegram'
import {
  botonesEmision,
  componerAvisoEmision,
  decidirBotonEmision,
  euros,
  interpretarAvisosEmision,
  lineaTrasPulsar,
  puedeSolicitarEmision,
  type AvisoEmision,
} from './tarificador-emision-asegura.ts'

const T = '11111111-1111-4111-8111-111111111111'
const ALBERTO = '123456789'

test('botón: solo el from.id del titular; otro id, sin id o sin chat configurado → rechazado', () => {
  assert.deepEqual(decidirBotonEmision({ from: { id: 123456789 } }, 'ok', [T], ALBERTO), { ok: true, trabajoId: T, decision: 'ok', autorizadoPor: ALBERTO })
  assert.equal(decidirBotonEmision({ from: { id: 987654321 } }, 'ok', [T], ALBERTO).ok, false)
  assert.equal(decidirBotonEmision({ from: {} }, 'ok', [T], ALBERTO).ok, false)
  assert.equal(decidirBotonEmision(null, 'ok', [T], ALBERTO).ok, false)
  assert.equal(decidirBotonEmision({ from: { id: 123456789 } }, 'ok', [T], undefined).ok, false)
  assert.equal(decidirBotonEmision({ from: { id: '' } }, 'ok', [T], '').ok, false)
})

test('botón: acción y trabajo bien formados', () => {
  assert.equal(decidirBotonEmision({ from: { id: ALBERTO } }, 'no', [T], ALBERTO).ok, true)
  assert.equal(decidirBotonEmision({ from: { id: ALBERTO } }, 'si', [T], ALBERTO).ok, false)
  assert.equal(decidirBotonEmision({ from: { id: ALBERTO } }, 'ok', ['x'], ALBERTO).ok, false)
  assert.equal(decidirBotonEmision({ from: { id: ALBERTO } }, 'ok', [T, 'extra'], ALBERTO).ok, false)
})

test('callback_data: prefijo emi enrutado por core-telegram y ≤ 64 bytes', () => {
  const [[ok, no]] = botonesEmision(T)
  assert.deepEqual(parseCallback(ok.callback), { prefix: 'emi', action: 'ok', args: [T] })
  assert.deepEqual(parseCallback(no.callback), { prefix: 'emi', action: 'no', args: [T] })
  assert.ok(Buffer.byteLength(ok.callback) <= 64)
})

test('el webhook enruta emi y comprueba from.id ANTES de llamar a asegura (en after)', () => {
  const src = readFileSync(new URL('../app/api/sivra/mensajes/telegram-webhook/route.ts', import.meta.url), 'utf8')
  const ini = src.indexOf('if (prefix === PREFIJO_EMISION)')
  assert.ok(ini > -1, 'falta el bloque del prefijo emi')
  const bloque = src.slice(ini, src.indexOf('return NextResponse.json({ ok: true })\n    }\n', ini + 400) + 60)
  const decide = bloque.indexOf('decidirBotonEmision(cb, action, args, process.env.TELEGRAM_CHAT_ID)')
  const llama = bloque.indexOf('autorizarEnAsegura(')
  assert.ok(decide > -1 && llama > decide, 'decidirBotonEmision tiene que ir antes de autorizarEnAsegura')
  assert.ok(bloque.indexOf('after(') > -1 && bloque.indexOf('after(') < llama, 'la llamada a asegura va en after()')
  assert.match(bloque, /if \(!d\.ok\) \{\s*await tgAnswerCallback\(cb\.id, d\.toast\)\s*return/)
})

test('solicitar: solo el correo configurado; sin env, nadie', () => {
  const env = { TARIFICADOR_EMISION_SOLICITANTE: 'titular@ejemplo.test' }
  assert.equal(puedeSolicitarEmision('Titular@Ejemplo.test', env), true)
  assert.equal(puedeSolicitarEmision('otro@ejemplo.test', env), false)
  assert.equal(puedeSolicitarEmision('titular@ejemplo.test', {}), false)
  assert.equal(puedeSolicitarEmision(null, env), false)
})

test('avisos: lectura fail-closed (error ≠ no hay pendientes) y textos sin datos personales', () => {
  assert.equal(interpretarAvisosEmision(500, null).estado, 'error')
  assert.equal(interpretarAvisosEmision(200, { estado: 'sin_esquema' }).estado, 'sin_esquema')
  const r = interpretarAvisosEmision(200, { estado: 'ok', pendientes: [{ trabajoId: T, tipo: 'pedir_autorizacion', compania: 'allianz', ramo: 'comunidades', iniciales: 'C.P.', primaCents: 134755 }, { trabajoId: 'x' }] })
  assert.ok(r.estado === 'ok' && r.pendientes.length === 1 && r.ilegibles === 1)
  const a: AvisoEmision = { trabajoId: T, tipo: 'pedir_autorizacion', compania: 'allianz', ramo: 'comunidades', iniciales: 'C.P.', referencia: 'AS-26-0001', primaCents: 134755, numeroPoliza: null, mensaje: null, caducaAt: null, capturaBase64: null }
  const t = componerAvisoEmision(a)
  assert.match(t, /1\.347,55€/)
  assert.match(t, /UN botón una vez/)
  assert.match(t, /anulación[^\n]*a mano/)
  assert.match(componerAvisoEmision({ ...a, tipo: 'emitida', numeroPoliza: '041234567' }), /ANULAR la anterior \(no se hace sola\)/)
  assert.equal(euros(null), '—')
  assert.equal(euros(5), '0,05€')
})

test('tras pulsar: cada desenlace dice lo que pasó', () => {
  assert.match(lineaTrasPulsar('ok', { estado: 'autorizado' }), /Autorizado/)
  assert.match(lineaTrasPulsar('no', { estado: 'cancelado' }), /no se emite/)
  assert.match(lineaTrasPulsar('ok', { estado: 'rechazado', motivo: 'solicitud caducada (24 h)' }), /No se ha podido autorizar: solicitud caducada/)
})
