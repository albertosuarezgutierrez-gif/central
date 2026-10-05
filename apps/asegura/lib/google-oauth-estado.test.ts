import test from 'node:test'
import assert from 'node:assert/strict'
import { firmarEstado, verificarEstado, VIGENCIA_ESTADO_MS } from './google-oauth-estado.ts'

const S = 'secreto-de-prueba-0123456789'
const base = { correduriaId: 'cor-1', cuentaId: 'cta-1', nonce: 'n-abc' }
const ok = (state: string, extra: Partial<Parameters<typeof verificarEstado>[1]> = {}) =>
  verificarEstado(state, { secreto: S, nonceCookie: 'n-abc', sesion: { cuentaId: 'cta-1', correduriaId: 'cor-1' }, ...extra })

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
  assert.deepEqual(ok(st, { sesion: { cuentaId: 'cta-2', correduriaId: 'cor-1' } }), { ok: false, motivo: 'sesion' })
  assert.deepEqual(ok(st, { sesion: { cuentaId: 'cta-1', correduriaId: 'cor-2' } }), { ok: false, motivo: 'sesion' })
})

test('sin sesión de asegura (flujo con ticket desde plataforma): state firmado + nonce del navegador bastan', () => {
  const r = ok(firmarEstado(base, S), { sesion: null })
  assert.equal(r.ok, true)
  if (r.ok) assert.deepEqual([r.datos.correduriaId, r.datos.cuentaId], ['cor-1', 'cta-1'])
})

test('🪤 sin sesión NO se relaja nada más: sin cookie del nonce o con otra firma sigue sin valer', () => {
  const st = firmarEstado(base, S)
  assert.deepEqual(ok(st, { sesion: null, nonceCookie: undefined }), { ok: false, motivo: 'nonce' })
  assert.deepEqual(ok(firmarEstado(base, 'otro-secreto'), { sesion: null }), { ok: false, motivo: 'firma' })
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
