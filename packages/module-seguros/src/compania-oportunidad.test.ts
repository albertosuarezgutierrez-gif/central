import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mismaCompania } from './compania-oportunidad.ts'

test('mismaCompania: relleno y acentos no cuentan', () => {
  assert.equal(mismaCompania('MUSSAP', 'Mutua de Seguros MUSSAP'), 'misma')
  assert.equal(mismaCompania('Línea Directa Aseguradora S.A.', 'linea directa'), 'misma')
})
test('mismaCompania: compañías distintas', () => {
  assert.equal(mismaCompania('Línea Directa', 'MUSSAP'), 'otra')
})
test('mismaCompania: sin compañía no se sabe', () => {
  assert.equal(mismaCompania(null, 'MUSSAP'), 'no_se')
  assert.equal(mismaCompania('Seguros', 'MUSSAP'), 'no_se')
})
