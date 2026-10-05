import test from 'node:test'
import assert from 'node:assert/strict'
import { firmarEstado, verificarEstado, VIGENCIA_ESTADO_MS } from './google-oauth-estado.ts'

const S = 'secreto-de-prueba-0123456789'
const base = { correduriaId: 'cor-1', cuentaId: 'cta-1', nonce: 'n-abc' }
const ok = (state: string, extra: Partial<Parameters<typeof verificarEstado>[1]> = {}) =>
  verificarEstado(state, { secreto: S, nonceCookie: 'n-abc', cuentaId: 'cta-1', correduriaId: 'cor-1', ...extra })

test('un state recién firmado, en el mismo navegador y sesión, vale', () => {
  const r = ok(firmarEstado(base, S))
  assert.equal(r.ok, true)
})

test('🪤 otra firma (state fabricado o con otro secreto) no vale', () => {
  assert.deepEqual(ok(firmarEstado(base, 'otro-secreto')), { ok: false, motivo: 'firma' })
  const [cuerpo] = firmarEstado(base, S).split('.')
  assert.deepEqual(ok(`${cuerpo}.AAAA`), { ok: false, motivo: 'firma' })
})

test('🪤 sin la cookie del nonce (state robado y usado desde otro navegador) no vale', () => {
  const st = firmarEstado(base, S)
  assert.deepEqual(ok(st, { nonceCookie: undefined }), { ok: false, motivo: 'nonce' })
  assert.deepEqual(ok(st, { nonceCookie: 'n-otro' }), { ok: false, motivo: 'nonce' })
})

test('🪤 otra sesión u otra correduría no vale', () => {
  const st = firmarEstado(base, S)
  assert.deepEqual(ok(st, { cuentaId: 'cta-2' }), { ok: false, motivo: 'sesion' })
  assert.deepEqual(ok(st, { correduriaId: 'cor-2' }), { ok: false, motivo: 'sesion' })
})

test('caduca a los 10 minutos', () => {
  const st = firmarEstado(base, S, 1_000)
  assert.equal(ok(st, { ahora: 1_000 + VIGENCIA_ESTADO_MS - 1 }).ok, true)
  assert.deepEqual(ok(st, { ahora: 1_000 + VIGENCIA_ESTADO_MS + 1 }), { ok: false, motivo: 'caducado' })
})

test('basura o vacío → mal formado; sin secreto no se firma', () => {
  assert.deepEqual(ok(''), { ok: false, motivo: 'mal_formado' })
  assert.deepEqual(ok('a.b.c'), { ok: false, motivo: 'mal_formado' })
  assert.throws(() => firmarEstado(base, ''))
})
