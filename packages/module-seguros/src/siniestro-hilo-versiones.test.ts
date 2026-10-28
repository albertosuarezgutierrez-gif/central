import { test } from 'node:test'
import assert from 'node:assert/strict'
import { hiloVigente, mapaSustituidoPor, sustituyeADe } from './siniestro-hilo-versiones.ts'

const m = (id: string, creadoAt: string, sustituyeA?: string) => ({ id, creadoAt, meta: sustituyeA ? { sustituyeA } : null })

test('sin ediciones, todo es vigente y no editado', () => {
  const r = hiloVigente([m('a', '2026-01-01'), m('b', '2026-01-02')])
  assert.deepEqual(r.map((x) => [x.id, x.editado, x.versionesAnteriores]), [['a', false, []], ['b', false, []]])
})

test('una edición deja solo la última versión, con la anterior listada', () => {
  const r = hiloVigente([m('a', '2026-01-01'), m('b', '2026-01-02'), m('a2', '2026-01-03', 'a')])
  assert.deepEqual(r.map((x) => x.id), ['b', 'a2'])
  assert.equal(r[1].editado, true)
  assert.deepEqual(r[1].versionesAnteriores, ['a'])
  assert.equal(r[1].creadoAtOriginal, '2026-01-01')
})

test('cadena de varias ediciones: de la más reciente a la original', () => {
  const r = hiloVigente([m('a', '2026-01-01'), m('a2', '2026-01-02', 'a'), m('a3', '2026-01-03', 'a2')])
  assert.deepEqual(r.map((x) => x.id), ['a3'])
  assert.deepEqual(r[0].versionesAnteriores, ['a2', 'a'])
  assert.equal(r[0].creadoAtOriginal, '2026-01-01')
})

test('sustituyeA a un id inexistente o a sí mismo se ignora (cuenta como original)', () => {
  const r = hiloVigente([m('x', '2026-01-01', 'no-existe'), m('y', '2026-01-02', 'y')])
  assert.deepEqual(r.map((x) => [x.id, x.editado]), [['x', false], ['y', false]])
})

test('un ciclo corrupto no cuelga ni pierde mensajes', () => {
  const r = hiloVigente([m('a', '2026-01-01', 'b'), m('b', '2026-01-02', 'a')])
  assert.equal(r.length, 0, 'ambos se sustituyen entre sí: nada vigente, pero termina')
})

test('mapaSustituidoPor y sustituyeADe', () => {
  const l = [m('a', '1'), m('a2', '2', 'a')]
  assert.equal(mapaSustituidoPor(l).get('a'), 'a2')
  assert.equal(mapaSustituidoPor(l).has('a2'), false)
  assert.equal(sustituyeADe({ meta: { sustituyeA: 5 } }), null)
  assert.equal(sustituyeADe({ meta: null }), null)
})
