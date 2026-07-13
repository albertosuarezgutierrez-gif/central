// Tests del parser puro del PDF de movimientos de tarjeta de Kutxabank. Runner: `node --test`
// (type-stripping). El texto de muestra reproduce el formato real extraído del PDF de la
// visa dual: cargos con el importe al final y abonos/recibos con el importe DELANTE del
// concepto (y el símbolo € pegado al texto).
import { test } from 'node:test'
import assert from 'node:assert/strict'

import { parseTarjetaPdfTexto, esExtractoTarjeta, cuadrarExtractoTarjeta, esPagoReciboTarjeta } from './extracto-tarjeta-pdf.ts'
import { casarDevolucion, type CompraCandidata } from './devoluciones-tarjeta.ts'

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

// ── Detección + cuadre + devoluciones (feature: subir extracto al agente) ─────────────────────

// Σ compras (192,39 + 35,00 + 100,00 = 327,39) − Σ devoluciones (35,00) = 292,39 = liquidación.
const EXTRACTO = `Número: 4662032019650302
19/06/2026 ******2019650302 COMPRA EN LEROY MERLIN SEVILLA -192,39 €
10/06/2026 ******2019650302 COMPRA EN CLUB MERCANTIL -35,00 €
15/06/2026 ******2019650302 COMPRA EN MERCADONA -100,00 €
20/06/2026 ******2019650302 DEVOLUCION CLUB MERCANTIL 35,00 €
01/07/2026 ******2019650302 292,39 €PAGO RECIBO 4662032019650302`

const FACTURA = `FACTURA Nº 2026-014
Fecha: 03/06/2026
Proveedor: ENDESA ENERGIA SAU
Total: 84,50 €`

test('esExtractoTarjeta: true en un extracto, false en una factura suelta', () => {
  assert.equal(esExtractoTarjeta(EXTRACTO), true)
  assert.equal(esExtractoTarjeta(FACTURA), false)
  assert.equal(esExtractoTarjeta(''), false)
})

test('esPagoReciboTarjeta reconoce la línea de liquidación', () => {
  assert.equal(esPagoReciboTarjeta('PAGO RECIBO 4662032019650302'), true)
  assert.equal(esPagoReciboTarjeta('COMPRA EN MERCADONA'), false)
  assert.equal(esPagoReciboTarjeta(null), false)
})

test('cuadrarExtractoTarjeta: cuadra cuando Σcompras − Σdevoluciones = liquidación', () => {
  const [ex] = parseTarjetaPdfTexto(EXTRACTO)
  const c = cuadrarExtractoTarjeta(ex)
  assert.equal(c.cuadra, true)
  assert.equal(c.liquidacion, 292.39)
  assert.equal(Math.round(c.sumaCompras * 100) / 100, 327.39)
  assert.equal(c.sumaDevoluciones, 35)
  assert.ok(c.diferencia < 0.02)
})

test('cuadrarExtractoTarjeta: NO cuadra si la liquidación no casa', () => {
  const malo = EXTRACTO.replace('292,39 €PAGO RECIBO', '500,00 €PAGO RECIBO')
  const [ex] = parseTarjetaPdfTexto(malo)
  const c = cuadrarExtractoTarjeta(ex)
  assert.equal(c.cuadra, false)
  assert.ok(c.diferencia > 100)
})

test('cuadrarExtractoTarjeta: sin línea de liquidación no es verificable (cuadra=true)', () => {
  const sinLiq = EXTRACTO.split('\n').filter(l => !l.includes('PAGO RECIBO')).join('\n')
  const [ex] = parseTarjetaPdfTexto(sinLiq)
  const c = cuadrarExtractoTarjeta(ex)
  assert.equal(c.liquidacion, null)
  assert.equal(c.cuadra, true)
})

const COMPRAS: CompraCandidata[] = [
  { id: 'c1', importe: -192.39, comercio: 'LEROY MERLIN', fecha: '2026-06-19', destino: 'turistico_pisos', propiedadId: 'prop_luxury_busto' },
  { id: 'c2', importe: -35.00, comercio: 'CLUB MERCANTIL', fecha: '2026-06-10', destino: 'personal', propiedadId: null },
  { id: 'c3', importe: -35.00, comercio: 'CLUB MERCANTIL', fecha: '2025-01-01', destino: 'personal', propiedadId: null }, // fuera de ventana
]

test('casarDevolucion: empareja el abono con la compra (mismo comercio, importe, ventana)', () => {
  const m = casarDevolucion({ importe: 35.00, comercio: 'CLUB MERCANTIL', fecha: '2026-06-20' }, COMPRAS)
  assert.deepEqual(m, { id: 'c2', destino: 'personal', propiedadId: null })
})

test('casarDevolucion: sin match si el comercio no coincide', () => {
  assert.equal(casarDevolucion({ importe: 35.00, comercio: 'OTRO SITIO', fecha: '2026-06-20' }, COMPRAS), null)
})

test('casarDevolucion: sin match si la compra queda fuera de la ventana de 120 días', () => {
  assert.equal(casarDevolucion({ importe: 35.00, comercio: 'CLUB MERCANTIL', fecha: '2026-06-20' }, [COMPRAS[2]]), null)
})

test('casarDevolucion: sin match si la compra candidata no tiene destino', () => {
  const sinDestino: CompraCandidata[] = [{ id: 'x', importe: -35, comercio: 'CLUB MERCANTIL', fecha: '2026-06-10', destino: null, propiedadId: null }]
  assert.equal(casarDevolucion({ importe: 35.00, comercio: 'CLUB MERCANTIL', fecha: '2026-06-20' }, sinDestino), null)
})
