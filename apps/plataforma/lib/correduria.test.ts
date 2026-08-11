// Tests de la lógica pura de la correduría. Runner: `node --test` (type-stripping).
import { test } from 'node:test'
import assert from 'node:assert/strict'

import { detectarCompania, motivoSeguros, companiaLabel, claveReferencia, claveReglaValida, COMPANIA_OTRAS } from './correduria.ts'

test('claveReglaValida rechaza claves genéricas/trampa y acepta comercios/códigos específicos', () => {
  // Trampa: substrings genéricos que colisionan con casi cualquier concepto del banco.
  // 'CUOTA' describe la naturaleza del cargo (hipoteca, comunidad, club, RETA), no el comercio:
  // aprendida de la hipoteca secuestraba la cuota de autónomos de BBVA (deducible).
  for (const mala of ['TRANSF', 'TOTAL', 'RECEIPT', 'MODA', 'RESTAURANTES', 'TRANSFERENCIA RECIBIDA', 'PAGO', 'SALDO', 'ABC',
    'CUOTA', 'IMPUESTO', 'CUOTA PTMO', 'PAGO DE IMPUESTO']) {
    assert.equal(claveReglaValida(mala), false, `debería rechazar "${mala}"`)
  }
  // Específicas y seguras: comercios, códigos de agente, DNI.
  for (const buena of ['PETROPRIX', 'IONOS', 'NETFLIX', 'M00171', '8/92361', 'TOTALENERGIES', '28823484E', 'GALOS CMI']) {
    assert.equal(claveReglaValida(buena), true, `debería aceptar "${buena}"`)
  }
  assert.equal(claveReglaValida(null), false)
  assert.equal(claveReglaValida(''), false)
})

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

test('claveReferencia extrae el código de referencia del concepto', () => {
  assert.equal(claveReferencia('M1454'), 'M1454')
  assert.equal(claveReferencia('Saldo. m00171'), 'M00171')
  assert.equal(claveReferencia('TRANSFERENCIAS // TRANSFERENCIA RECIBIDA // SALDO. M00171'), 'M00171')
  assert.equal(claveReferencia('TRANSFERENCIAS // TRANSFERENCIA RECIBIDA // M1454'), 'M1454')
  assert.equal(claveReferencia('Saldo. 8/92361'), '8/92361')
})

test('claveReferencia rechaza números tipo fecha/importe y vacíos', () => {
  assert.equal(claveReferencia('LIQ.COMISIONES 202604'), null)   // 202604 = fecha, sin letra ni barra
  assert.equal(claveReferencia('Pago de transferencia'), null)
  assert.equal(claveReferencia(''), null)
  assert.equal(claveReferencia(null), null)
})
