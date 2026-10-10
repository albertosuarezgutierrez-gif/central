// Cepos de la emisión del robot, lado plataforma (10/10/2026). `node --test`. Sin datos personales.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { parseCallback } from '@central/core-telegram'
import { verificarFirmaAutorizacionEmision } from '@central/module-tarificacion'
import {
  botonesEmision,
  componerAvisoEmision,
  cuerpoFirmadoAutorizacion,
  decidirBotonEmision,
  euros,
  interpretarAvisosEmision,
  lineaTrasPulsar,
  puedeSolicitarEmision,
  type AvisoEmision,
} from './tarificador-emision-asegura.ts'

const T = '11111111-1111-4111-8111-111111111111'
const ALBERTO = '123456789'
const H = 'c'.repeat(64)
const HC = 'c'.repeat(16)

test('botón: solo el from.id del titular; otro id, sin id o sin chat configurado → rechazado', () => {
  assert.deepEqual(decidirBotonEmision({ from: { id: 123456789 } }, 'ok', [T, HC], ALBERTO), { ok: true, trabajoId: T, decision: 'ok', hashCorto: HC, autorizadoPor: ALBERTO })
  assert.equal(decidirBotonEmision({ from: { id: 987654321 } }, 'ok', [T, HC], ALBERTO).ok, false)
  assert.equal(decidirBotonEmision({ from: {} }, 'ok', [T, HC], ALBERTO).ok, false)
  assert.equal(decidirBotonEmision(null, 'ok', [T, HC], ALBERTO).ok, false)
  assert.equal(decidirBotonEmision({ from: { id: 123456789 } }, 'ok', [T, HC], undefined).ok, false)
  assert.equal(decidirBotonEmision({ from: { id: '' } }, 'ok', [T, HC], '').ok, false)
})

test('botón: acción y trabajo bien formados', () => {
  assert.equal(decidirBotonEmision({ from: { id: ALBERTO } }, 'no', [T, HC], ALBERTO).ok, true)
  assert.equal(decidirBotonEmision({ from: { id: ALBERTO } }, 'si', [T, HC], ALBERTO).ok, false)
  assert.equal(decidirBotonEmision({ from: { id: ALBERTO } }, 'ok', ['x', HC], ALBERTO).ok, false)
  assert.equal(decidirBotonEmision({ from: { id: ALBERTO } }, 'ok', [T], ALBERTO).ok, false, 'sin hash de la pantalla previa')
  assert.equal(decidirBotonEmision({ from: { id: ALBERTO } }, 'ok', [T, 'extra'], ALBERTO).ok, false)
  assert.equal(decidirBotonEmision({ from: { id: ALBERTO } }, 'ok', [T, HC, 'extra'], ALBERTO).ok, false)
})

test('callback_data: prefijo emi enrutado por core-telegram y ≤ 64 bytes', () => {
  const [[ok, no]] = botonesEmision(T, H)
  assert.deepEqual(parseCallback(ok.callback), { prefix: 'emi', action: 'ok', args: [T, HC] })
  assert.deepEqual(parseCallback(no.callback), { prefix: 'emi', action: 'no', args: [T, HC] })
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
  const r = interpretarAvisosEmision(200, { estado: 'ok', pendientes: [
    { trabajoId: T, tipo: 'pedir_autorizacion', compania: 'allianz', ramo: 'comunidades', iniciales: 'C.P.', primaCents: 134755, hashDatos: H },
    { trabajoId: T, tipo: 'pedir_autorizacion', compania: 'allianz', ramo: 'comunidades', iniciales: 'C.P.', primaCents: 134755 },
    { trabajoId: 'x' },
  ] })
  assert.ok(r.estado === 'ok' && r.pendientes.length === 1 && r.ilegibles === 2, 'una petición sin hash de pantalla previa no se puede pintar con botón')
  const a: AvisoEmision = { trabajoId: T, tipo: 'pedir_autorizacion', compania: 'allianz', ramo: 'comunidades', iniciales: 'C.P.', referencia: 'AS-26-0001', primaCents: 134755, numeroPoliza: null, mensaje: null, caducaAt: null, capturaBase64: null, hashDatos: H }
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

test('la llamada a asegura va FIRMADA con el secreto propio del webhook (requireSecret, sin fallback)', () => {
  const S = 's'.repeat(40)
  const ahora = 1_760_000_000_000
  const c = cuerpoFirmadoAutorizacion(S, { trabajoId: T, decision: 'ok', hashCorto: HC, autorizadoPor: ALBERTO }, ahora)
  assert.equal(verificarFirmaAutorizacionEmision(S, c, ahora).ok, true)
  assert.equal(verificarFirmaAutorizacionEmision('otro'.repeat(10), c, ahora).ok, false)
  assert.throws(() => cuerpoFirmadoAutorizacion('', { trabajoId: T, decision: 'ok', hashCorto: HC, autorizadoPor: ALBERTO }))
  const src = readFileSync(new URL('./tarificador-emision-asegura.ts', import.meta.url), 'utf8')
  const fn = src.slice(src.indexOf('export async function autorizarEnAsegura'))
  assert.ok(fn.indexOf('cuerpoFirmadoAutorizacion(leerSecreto(), d)') > -1, 'se firma con el secreto leído')
  assert.ok(fn.indexOf('leerSecreto()') < fn.indexOf("puerto('/autorizar'"), 'se firma ANTES de llamar a asegura')
  assert.match(fn, /JSON\.stringify\(cuerpo\)/, 'lo que viaja es el cuerpo firmado, no la decisión sin firma')
  const hook = readFileSync(new URL('../app/api/sivra/mensajes/telegram-webhook/route.ts', import.meta.url), 'utf8')
  assert.match(hook, /autorizarEnAsegura\(\{[^}]*hashCorto: d\.hashCorto[^}]*\}, \(\) => requireSecret\(ENV_FIRMA_AUTORIZACION\)\)/, 'el webhook lee el secreto con requireSecret y sin fallback')
})
