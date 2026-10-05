import test from 'node:test'
import assert from 'node:assert/strict'
import { polizaAnteriorParaTarificar } from './poliza-anterior.ts'

test('Mapfre: «4840402030 01» viaja sin el sufijo de versión', () => {
  assert.equal(polizaAnteriorParaTarificar('4840402030 01', 'C0058'), '4840402030')
  assert.equal(polizaAnteriorParaTarificar('  4840402030   01 ', 'c0058'), '4840402030')
})
test('otra compañía: solo se quitan los espacios', () => {
  assert.equal(polizaAnteriorParaTarificar('4840402030 01', 'C0109'), '484040203001')
})
test('sin compañía: espacios fuera y nada más', () => {
  assert.equal(polizaAnteriorParaTarificar('4840402030 01', null), '484040203001')
  assert.equal(polizaAnteriorParaTarificar(' 4840402030 01 '), '484040203001')
})
test('Mapfre sin sufijo o pegado queda igual', () => {
  assert.equal(polizaAnteriorParaTarificar('4840402030', 'C0058'), '4840402030')
  assert.equal(polizaAnteriorParaTarificar('484040203001', 'C0058'), '484040203001')
  assert.equal(polizaAnteriorParaTarificar(null, 'C0058'), '')
})
