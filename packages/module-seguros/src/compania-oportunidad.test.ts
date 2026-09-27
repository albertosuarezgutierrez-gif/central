import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mismaCompania, mismoSeguro } from './compania-oportunidad.ts'

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
test('mismoSeguro: el nº de póliza manda sobre la compañía', () => {
  // Dos coches en la MISMA compañía: números distintos = dos seguros.
  assert.equal(mismoSeguro({ aseguradora: 'MUSSAP', numeroPoliza: '0123-456' }, { aseguradora: 'Mussap', numeroPoliza: '987654' }), 'otra')
  assert.equal(mismoSeguro({ aseguradora: 'MUSSAP', numeroPoliza: '0123 456' }, { aseguradora: null, numeroPoliza: '123456' }), 'misma')
})
test('mismoSeguro: sin número en un lado cae a la compañía', () => {
  assert.equal(mismoSeguro({ aseguradora: 'Línea Directa', numeroPoliza: '555666' }, { aseguradora: 'MUSSAP', numeroPoliza: null }), 'otra')
  assert.equal(mismoSeguro({ aseguradora: 'MUSSAP', numeroPoliza: '555666' }, { aseguradora: 'Mutua MUSSAP' }), 'misma')
  assert.equal(mismoSeguro({ aseguradora: null }, { aseguradora: 'MUSSAP' }), 'no_se')
})
