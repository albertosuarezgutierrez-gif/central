import { test } from 'node:test'
import assert from 'node:assert/strict'
import { validarCp, provinciaPorCp, PROVINCIA_POR_CP } from './cp.ts'
import { municipiosPorCp } from './servidor.ts'
import * as raiz from './index.ts'

test('validarCp: inválidos', () => {
  for (const x of ['', '1234', '123456', 'abcde', '00123', '53001', '99999', null, undefined, '41 01']) {
    assert.equal(validarCp(x).ok, false, String(x))
  }
  assert.deepEqual(validarCp(' 41011 '), { ok: true, valor: '41011' })
  assert.equal(validarCp('01001').ok, true)
  assert.equal(validarCp('52001').ok, true)
})

test('provinciaPorCp: Ceuta/Melilla, Jaén y vacíos', () => {
  assert.equal(provinciaPorCp('51001'), 'Ceuta')
  assert.equal(provinciaPorCp('52004'), 'Melilla')
  assert.equal(provinciaPorCp('23693'), 'Jaén')
  assert.equal(provinciaPorCp('07001'), 'Illes Balears')
  assert.equal(provinciaPorCp('26001'), 'La Rioja')
  assert.equal(provinciaPorCp('00100'), null)
  assert.equal(provinciaPorCp('99999'), null)
  assert.equal(provinciaPorCp(null), null)
  assert.equal(provinciaPorCp(''), null)
  assert.equal(Object.keys(PROVINCIA_POR_CP).length, 52)
})

test('23693 → Jaén / Castillo de Locubín', () => {
  assert.equal(provinciaPorCp('23693'), 'Jaén')
  assert.deepEqual(municipiosPorCp('23693'), ['Castillo de Locubín'])
})

test('municipiosPorCp: inválido o desconocido → null (nunca [])', () => {
  assert.equal(municipiosPorCp('abc'), null)
  assert.equal(municipiosPorCp('4101'), null)
  assert.equal(municipiosPorCp(undefined), null)
  assert.equal(municipiosPorCp('99999'), null)
  assert.deepEqual(municipiosPorCp(' 41011 '), ['Sevilla'])
})

test('raíz reexporta vía de core-catastro sin duplicarla', () => {
  assert.equal(typeof raiz.normVia, 'function')
  assert.equal(typeof raiz.tokensVia, 'function')
  assert.equal(raiz.normVia('Calle Parra'), raiz.normVia('CALLE PARRA'))
  assert.equal(raiz.nombreCalleEscrito('Calle Parra 12'), 'PARRA')
  assert.equal(raiz.provinciaAlternativa('Bizkaia'), 'Vizcaya')
})
