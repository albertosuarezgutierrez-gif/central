// Tests de la lógica pura de la correduría. Runner: `node --test` (type-stripping).
import { test } from 'node:test'
import assert from 'node:assert/strict'

import { detectarCompania, motivoSeguros, companiaLabel, claveReferencia, claveComercio, claveReglaValida, COMPANIA_OTRAS } from './correduria.ts'

test('claveReglaValida rechaza claves genéricas/trampa y acepta comercios/códigos específicos', () => {
  // Trampa: substrings genéricos que colisionan con casi cualquier concepto del banco.
  for (const mala of ['TRANSF', 'TOTAL', 'RECEIPT', 'MODA', 'RESTAURANTES', 'TRANSFERENCIA RECIBIDA', 'PAGO', 'SALDO', 'ABC']) {
    assert.equal(claveReglaValida(mala), false, `debería rechazar "${mala}"`)
  }
  // Específicas y seguras: comercios, códigos de agente, DNI.
  for (const buena of ['PETROPRIX', 'IONOS', 'NETFLIX', 'M00171', '8/92361', 'TOTALENERGIES', '28823484E', 'GALOS CMI']) {
    assert.equal(claveReglaValida(buena), true, `debería aceptar "${buena}"`)
  }
  assert.equal(claveReglaValida(null), false)
  assert.equal(claveReglaValida(''), false)
})

test('claveComercio saca el comercio REAL de las compras de tarjeta (último segmento), no el descriptor', () => {
  // Compra en el extranjero: el comercio va en el ÚLTIMO segmento; el primero es genérico.
  // Antes devolvía "COMERCIO" → regla-trampa que casaba TODA compra del extranjero.
  const extranjera = 'COMPRA EN COMERCIO EXTRANJERO-COMISIÓN 3 % INCLUÍDA // PAGO CON TARJETA // VERCEL INC.'
  assert.equal(claveComercio(extranjera), 'VERCEL')
  assert.notEqual(claveComercio(extranjera), 'COMERCIO')
  // Grandes superficies: coge el comercio del último segmento, no "GRANDES"/"SUPERFICIES".
  assert.equal(claveComercio("PAGO CON TARJETA EN DISCOS, LIBROS, FOTOS Y PC'S // PAGO CON TARJETA // ANTHROPIC IRELAND"), 'ANTHROPIC')
  // Compra doméstica clásica: el comercio ya está en el primer segmento → sigue funcionando.
  assert.equal(claveComercio('COMPRA EN PETROPRIX GINES // PAGO CON TARJETA // PETROPRIX'), 'PETROPRIX')
  // El '*' dentro del último segmento se respeta (formato real "ANTHROPIC* CLAUDE SUB").
  assert.equal(claveComercio("PAGO CON TARJETA EN DISCOS, LIBROS, FOTOS Y PC'S // PAGO CON TARJETA // ANTHROPIC* CLAUDE SUB"), 'CLAUDE')
})

test('claveComercio + claveReglaValida: la clave de una compra extranjera es específica y segura', () => {
  const clave = claveComercio('COMPRA EN COMERCIO EXTRANJERO-COMISIÓN 3 % INCLUÍDA // PAGO CON TARJETA // VERCEL INC.')
  assert.equal(clave, 'VERCEL')
  assert.equal(claveReglaValida(clave), true)
  // Y los descriptores genéricos quedan bloqueados también en la guardia (doble red).
  assert.equal(claveReglaValida('COMERCIO'), false)
  assert.equal(claveReglaValida('EXTRANJERO'), false)
  assert.equal(claveReglaValida('GRANDES'), false)
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
