import { test } from 'node:test'
import assert from 'node:assert/strict'
import { cuerpoParaIA, desdeCron, filtrarNoProcesados, fusionarProcesados, idEstable, MAX_PROCESADOS, parsearSince } from './inversion-correos-puro.ts'

test('filtrarNoProcesados: salta los ya vistos y los repetidos, conserva orden', () => {
  assert.deepEqual(filtrarNoProcesados(['a', 'b', 'b', 'c', ''], ['a']), ['b', 'c'])
  assert.deepEqual(filtrarNoProcesados(['a'], ['a']), [])
  assert.deepEqual(filtrarNoProcesados([], ['a']), [])
})

test('fusionarProcesados: sin duplicados y recorta a los más recientes', () => {
  assert.deepEqual(fusionarProcesados(['a', 'b'], ['b', 'c']), ['a', 'b', 'c'])
  const previos = Array.from({ length: MAX_PROCESADOS }, (_, i) => `m${i}`)
  const r = fusionarProcesados(previos, ['n1', 'n2'])
  assert.equal(r.length, MAX_PROCESADOS)
  assert.equal(r[r.length - 1], 'n2')
  assert.ok(!r.includes('m0') && !r.includes('m1') && r.includes('m2'))
})

test('idEstable: Message-ID manda; sin él, uid con buzón', () => {
  assert.equal(idEstable(' <abc@mail.idealista.com> ', 'inmobiliaria', 7), '<abc@mail.idealista.com>')
  assert.equal(idEstable(null, 'inmobiliaria', 7), 'uid:inmobiliaria:7')
  assert.equal(idEstable('', 'inmobiliaria', 7), 'uid:inmobiliaria:7')
})

test('procesados por Message-ID: el mismo correo con otro UID se salta', () => {
  const ids = [idEstable('<a@x>', 'inmobiliaria', 10), idEstable('<b@x>', 'inmobiliaria', 11)]
  assert.deepEqual(filtrarNoProcesados(ids, ['<a@x>']), ['<b@x>'])
})

test('desdeCron: hoy menos 2 días', () => {
  assert.equal(desdeCron(new Date('2026-10-28T10:00:00Z')).toISOString(), '2026-10-26T10:00:00.000Z')
})

test('parsearSince: formatos de la UI', () => {
  assert.equal(parsearSince('2026/10/01')?.toISOString(), '2026-10-01T00:00:00.000Z')
  assert.equal(parsearSince('2026-10-01')?.toISOString(), '2026-10-01T00:00:00.000Z')
  assert.equal(parsearSince('1790000000')?.getTime(), 1790000000000)
  assert.equal(parsearSince('basura'), null)
  assert.equal(parsearSince(''), null)
})

test('cuerpoParaIA: texto si hay, si no HTML sin etiquetas', () => {
  assert.equal(cuerpoParaIA('hola', '<p>x</p>'), 'hola')
  assert.equal(cuerpoParaIA('', '<style>a{}</style><p>Chalet&nbsp;<b>300.000</b></p>'), 'Chalet 300.000')
})
