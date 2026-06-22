// Tests de la lógica pura de la correduría. Runner: `node --test` (type-stripping).
import { test } from 'node:test'
import assert from 'node:assert/strict'

import { detectarCompania, motivoSeguros, companiaLabel, COMPANIA_OTRAS } from './correduria.ts'

test('detectarCompania reconoce aseguradoras por nombre', () => {
  assert.equal(detectarCompania('RECIBO GENERALI SEGUROS', '', 'GENERALI SEG.'), 'Generali')
  assert.equal(detectarCompania('LIQ.COMISIONES 202604', '', ''), 'Mapfre')
  assert.equal(detectarCompania('', '', 'CASER S.A.'), 'Caser')
  assert.equal(detectarCompania('-FRA-COMIS-20260331', '', ''), 'Caser')
  assert.equal(detectarCompania('PAGO RECIBO AXA SEGUROS', '', ''), 'AXA')
  assert.equal(detectarCompania('COMISIONES OCCIDENT', '', 'CATALANA OCCIDENTE'), 'Occident')
})

test('detectarCompania manda lo desconocido a "Otras"', () => {
  assert.equal(detectarCompania('TRANSFERENCIA RECIBIDA REF 12345', '', 'PEPITO PEREZ'), COMPANIA_OTRAS)
})

test('motivoSeguros: por nombre cuando casa una aseguradora / comisión', () => {
  assert.equal(motivoSeguros('BBVA', 'TRANSFERENCIA RECIBIDA // LIQ.COMISIONES 202604', 'ALBERTO SUAREZ'), 'nombre')
  assert.equal(motivoSeguros('Kutxabank', 'RECIBO GENERALI SEGUROS', 'GENERALI'), 'nombre')
})

test('motivoSeguros: por descarte cuando no hay pista de aseguradora', () => {
  assert.equal(motivoSeguros('BBVA', 'TRANSFERENCIA RECIBIDA REF 998877', 'ALBERTO SUAREZ'), 'descarte')
})

test('companiaLabel renombra solo "Otras"', () => {
  assert.equal(companiaLabel('Mapfre'), 'Mapfre')
  assert.equal(companiaLabel(COMPANIA_OTRAS), 'Sin identificar (revisar)')
})
