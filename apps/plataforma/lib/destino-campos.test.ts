import test from 'node:test'
import assert from 'node:assert/strict'
import { camposSeguros, esCompaniaConocida } from './destino-campos.ts'

test('seguros + compañía → guarda compañía y subcategoría comision_seguro', () => {
  assert.deepEqual(camposSeguros('seguros', 'Mapfre'), { limpiarCompania: false, compania: 'Mapfre', subcategoria: 'comision_seguro' })
})
test('seguros sin compañía → no toca la existente', () => {
  assert.deepEqual(camposSeguros('seguros'), { limpiarCompania: false, compania: null, subcategoria: null })
  assert.deepEqual(camposSeguros('seguros', ''), { limpiarCompania: false, compania: null, subcategoria: null })
})
test('destino distinto de seguros → limpia compañía aunque venga una', () => {
  assert.deepEqual(camposSeguros('personal', 'Mapfre'), { limpiarCompania: true, compania: null, subcategoria: null })
})
test('esCompaniaConocida valida contra COMPANIAS_CONOCIDAS', () => {
  assert.equal(esCompaniaConocida('Zürich'), true)
  assert.equal(esCompaniaConocida('Inventada'), false)
  assert.equal(esCompaniaConocida(undefined), false)
})
