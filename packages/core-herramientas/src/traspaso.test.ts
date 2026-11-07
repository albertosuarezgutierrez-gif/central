import { test } from 'node:test'
import assert from 'node:assert/strict'
import { firmarTraspaso, verificarTraspaso, VIDA_TRASPASO_S } from './traspaso.ts'

const S_CONTA = 'c'.repeat(40)
const S_RRHH = 'r'.repeat(40)
const d = { aud: 'contabilidad' as const, sub: '11111111-1111-4111-8111-111111111111', email: 'Pilar@Example.com', ref: '22222222-2222-4222-8222-222222222222', jti: '33333333-3333-4333-8333-333333333333' }
const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url')

test('ida y vuelta', async () => {
  const t = await firmarTraspaso(d, S_CONTA)
  const r = await verificarTraspaso(t, 'contabilidad', S_CONTA)
  assert.ok(r.ok)
  if (r.ok) { assert.equal(r.carga.email, 'pilar@example.com'); assert.equal(r.carga.ref, d.ref) }
})

test('CEPO aud ajeno: un token para contabilidad no entra en rrhh', async () => {
  const t = await firmarTraspaso(d, S_CONTA)
  assert.deepEqual(await verificarTraspaso(t, 'rrhh', S_CONTA), { ok: false, error: 'aud' })
})

test('CEPO firma con el secreto de OTRA app', async () => {
  const t = await firmarTraspaso({ ...d, aud: 'rrhh' }, S_RRHH)
  assert.deepEqual(await verificarTraspaso(t, 'rrhh', S_CONTA), { ok: false, error: 'firma' })
})

test('CEPO expirado (60 s)', async () => {
  const t = await firmarTraspaso(d, S_CONTA, new Date(Date.now() - (VIDA_TRASPASO_S + 1) * 1000))
  assert.deepEqual(await verificarTraspaso(t, 'contabilidad', S_CONTA), { ok: false, error: 'expirado' })
})

test('CEPO alg:none y alg distinto', async () => {
  const t = await firmarTraspaso(d, S_CONTA)
  const [, carga] = t.split('.')
  assert.deepEqual(await verificarTraspaso(`${b64({ alg: 'none', typ: 'JWT' })}.${carga}.x`, 'contabilidad', S_CONTA), { ok: false, error: 'alg' })
  assert.deepEqual(await verificarTraspaso(`${b64({ alg: 'HS512', typ: 'JWT' })}.${carga}.${t.split('.')[2]}`, 'contabilidad', S_CONTA), { ok: false, error: 'alg' })
})

test('CEPO carga manipulada (otra ref) → firma no cuadra', async () => {
  const t = await firmarTraspaso(d, S_CONTA)
  const [cab, carga, firma] = t.split('.')
  const o = JSON.parse(Buffer.from(carga, 'base64url').toString())
  o.ref = '44444444-4444-4444-8444-444444444444'
  assert.deepEqual(await verificarTraspaso(`${cab}.${b64(o)}.${firma}`, 'contabilidad', S_CONTA), { ok: false, error: 'firma' })
})

test('CEPO typ de empleado / iss ajeno, firmados con el secreto bueno, no pasan', async () => {
  const { createHmac } = await import('node:crypto')
  const firmar = (o: Record<string, unknown>) => {
    const cuerpo = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64(o)}`
    return `${cuerpo}.${createHmac('sha256', S_CONTA).update(cuerpo).digest('base64url')}`
  }
  const ahora = Math.floor(Date.now() / 1000)
  const ok = { iss: 'empresa.grupoasegura.es', aud: 'contabilidad', typ: 'traspaso_empresa', sub: d.sub, email: 'a@b.es', ref: d.ref, jti: d.jti, iat: ahora, exp: ahora + 30 }
  assert.ok((await verificarTraspaso(firmar(ok), 'contabilidad', S_CONTA)).ok, 'control: el token bien formado pasa')
  assert.deepEqual(await verificarTraspaso(firmar({ ...ok, typ: 'empleado' }), 'contabilidad', S_CONTA), { ok: false, error: 'typ' })
  assert.deepEqual(await verificarTraspaso(firmar({ ...ok, iss: 'rrhh' }), 'contabilidad', S_CONTA), { ok: false, error: 'iss' })
  assert.deepEqual(await verificarTraspaso(firmar({ ...ok, exp: ahora + 3600 }), 'contabilidad', S_CONTA), { ok: false, error: 'expirado' }, 'vida > 60 s')
})

test('secreto corto o ausente: ni firma ni verifica', async () => {
  await assert.rejects(firmarTraspaso(d, 'corto'))
  const t = await firmarTraspaso(d, S_CONTA)
  assert.deepEqual(await verificarTraspaso(t, 'contabilidad', ''), { ok: false, error: 'firma' })
})
