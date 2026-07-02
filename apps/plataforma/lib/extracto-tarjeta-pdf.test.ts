// Tests del parser puro del PDF de movimientos de tarjeta de Kutxabank. Runner: `node --test`
// (type-stripping). El texto de muestra reproduce el formato real extraído del PDF de la
// visa dual: cargos con el importe al final y abonos/recibos con el importe DELANTE del
// concepto (y el símbolo € pegado al texto).
import { test } from 'node:test'
import assert from 'node:assert/strict'

import { parseTarjetaPdfTexto } from './extracto-tarjeta-pdf.ts'

const TEXTO = `Tipo: visa dual Número: 4662032019650302
Movimientos de tarjeta
01/07/2026
Fecha Tarjeta Concepto Situación Importe
01/01/2026 ******2019650302 617,87 €PAGO RECIBO 4662032019650302
02/01/2026 ******2019650302 COMPRA EN DIA SEVILLA 2260 -4,17 €
02/01/2026 ******2019650302 0,15 €DEVOLUCION PARKINGLIBRE SISTEMAS DE
19/06/2026 ******2019650302 COMPRA EN LEROY MERLIN SEVILLA -192,39 €
01/07/2026 ******2019650302 1.355,24 €PAGO RECIBO 4662032019650302
1/4
Kutxabank, S.A., Gran Vía, 30-32, Bilbao, C.I.F. A95653077`

test('parsea cargos, abonos y recibos con el importe delante o detrás', () => {
  const [ex] = parseTarjetaPdfTexto(TEXTO)
  assert.equal(ex.movimientos.length, 5)
  const [recibo, compra, devolucion, leroy, reciboJul] = ex.movimientos
  assert.deepEqual(
    [recibo.fechaOperacion, recibo.importe, recibo.concepto],
    ['2026-01-01', 617.87, 'PAGO RECIBO 4662032019650302'],
  )
  assert.deepEqual([compra.importe, compra.concepto], [-4.17, 'COMPRA EN DIA SEVILLA 2260'])
  assert.deepEqual([devolucion.importe, devolucion.concepto], [0.15, 'DEVOLUCION PARKINGLIBRE SISTEMAS DE'])
  assert.deepEqual([leroy.importe, leroy.concepto], [-192.39, 'COMPRA EN LEROY MERLIN SEVILLA'])
  assert.equal(reciboJul.importe, 1355.24)   // separador de miles es-ES
})

test('ccc derivado del PAN casa con la cuenta existente de la tarjeta', () => {
  const [ex] = parseTarjetaPdfTexto(TEXTO)
  assert.equal(ex.ccc, 'TARJETA-KUTXA-0302')
  assert.equal(ex.fechaInicio, '2026-01-01')
  assert.equal(ex.fechaFin, '2026-07-01')
  assert.equal(ex.banco, '')   // sin override → importarExtracto no renombra la cuenta
})

test('fechaValor=fechaOperacion y campos de hash vacíos (dedupe estable al reimportar)', () => {
  const [ex] = parseTarjetaPdfTexto(TEXTO)
  for (const m of ex.movimientos) {
    assert.equal(m.fechaValor, m.fechaOperacion)
    assert.equal(m.conceptoComun, '')
    assert.equal(m.referencia, '')
    assert.equal(m.saldoPosterior, undefined)
  }
})

test('líneas que no son movimientos (cabeceras, pie) se ignoran; sin movimientos → []', () => {
  assert.deepEqual(parseTarjetaPdfTexto('Fecha Tarjeta Concepto\n1/4\nKutxabank, S.A.'), [])
})
