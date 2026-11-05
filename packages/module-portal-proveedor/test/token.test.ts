// Tokens del portal del proveedor. Cepos vistos FALLAR (05/11/2026), uno por aserción, y restaurados:
// (1) en evaluarEnlace quitar la comprobación de `caducaEn` → rojo «caducado».
// (2) en evaluarEnlace quitar `enlace.proposito !== p.proposito` → rojo «alcance: propósito».
// (3) en evaluarEnlace quitar el `documentoId` → rojo «alcance: documento».
// (4) en evaluarEnlace quitar `revocadoEn` → rojo «revocado».
// (5) en generarToken guardar el token en vez del hash (`hash: token`) → rojo «solo el hash».
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  calcularCaducidad, evaluarEnlace, formatoTokenValido, generarToken, hashToken, RESPUESTA_ENLACE_NO_VALIDO, sinToken, type EnlaceGuardado,
} from '../src/index.ts'
import { hoy, masDias } from './_util.ts'

const enlaceDe = (token: string, o: Partial<EnlaceGuardado> = {}): EnlaceGuardado => ({
  tokenHash: hashToken(token), proposito: 'pedido', documentoId: 'doc-1', caducaEn: masDias(hoy(), 7), revocadoEn: null, cerradoEn: null, ...o,
})

test('token: 256 bits aleatorios, formato fijo y solo el HASH (sha-256) sale para guardar', () => {
  const a = generarToken(), b = generarToken()
  assert.ok(formatoTokenValido(a.token))
  assert.notEqual(a.token, b.token)
  assert.match(a.hash, /^[0-9a-f]{64}$/)
  assert.equal(a.hash, hashToken(a.token))
  assert.notEqual(a.hash, a.token)
  assert.ok(!a.hash.includes(a.token.slice(3, 20)))
  // el token no lleva ningún identificador: 3 + 43 caracteres de base64url
  assert.equal(a.token.length, 46)
})

test('token: el formato inválido se rechaza sin mirar nada', () => {
  for (const t of [null, 123, '', 'pp_corto', 'xx_' + 'a'.repeat(43), 'pp_' + 'a'.repeat(42) + '!']) assert.equal(formatoTokenValido(t), false)
  const e = evaluarEnlace(null, { token: 'basura', proposito: 'pedido', ahora: hoy() })
  assert.deepEqual(e, { ok: false, motivo: 'formato' })
})

test('enlace vigente: hash, propósito y documento correctos → ok', () => {
  const { token } = generarToken()
  assert.deepEqual(evaluarEnlace(enlaceDe(token), { token, proposito: 'pedido', ahora: hoy(), documentoId: 'doc-1' }), { ok: true })
})

test('caducado', () => {
  const { token } = generarToken()
  const e = evaluarEnlace(enlaceDe(token, { caducaEn: masDias(hoy(), -1) }), { token, proposito: 'pedido', ahora: hoy() })
  assert.deepEqual(e, { ok: false, motivo: 'caducado' })
})

test('alcance: propósito (un enlace de pedido no sube facturas)', () => {
  const { token } = generarToken()
  assert.deepEqual(evaluarEnlace(enlaceDe(token), { token, proposito: 'factura', ahora: hoy() }), { ok: false, motivo: 'alcance' })
})

test('alcance: documento (un enlace no abre otro pedido)', () => {
  const { token } = generarToken()
  assert.deepEqual(evaluarEnlace(enlaceDe(token), { token, proposito: 'pedido', ahora: hoy(), documentoId: 'doc-2' }), { ok: false, motivo: 'alcance' })
})

test('revocado y cerrado', () => {
  const { token } = generarToken()
  assert.deepEqual(evaluarEnlace(enlaceDe(token, { revocadoEn: hoy() }), { token, proposito: 'pedido', ahora: hoy() }), { ok: false, motivo: 'revocado' })
  assert.deepEqual(evaluarEnlace(enlaceDe(token, { cerradoEn: hoy() }), { token, proposito: 'pedido', ahora: hoy() }), { ok: false, motivo: 'cerrado' })
})

test('otro token con el mismo formato no abre un enlace ajeno', () => {
  const a = generarToken(), b = generarToken()
  assert.deepEqual(evaluarEnlace(enlaceDe(a.token), { token: b.token, proposito: 'pedido', ahora: hoy() }), { ok: false, motivo: 'hash' })
})

test('caducidad acotada a [1, 90] días (un valor raro no da un enlace eterno)', () => {
  const h = hoy()
  assert.equal(calcularCaducidad(h, 14).getTime(), masDias(h, 14).getTime())
  assert.equal(calcularCaducidad(h, 100000).getTime(), masDias(h, 90).getTime())
  assert.equal(calcularCaducidad(h, -5).getTime(), masDias(h, 1).getTime())
  assert.equal(calcularCaducidad(h, Number.NaN).getTime(), masDias(h, 1).getTime())
})

test('respuesta pública única y sin token en los logs', () => {
  assert.equal(RESPUESTA_ENLACE_NO_VALIDO.status, 404)
  const { token } = generarToken()
  const linea = sinToken(`GET /prov/${token} 404`)
  assert.ok(!linea.includes(token))
  assert.match(linea, /pp_\[oculto\]/)
})
