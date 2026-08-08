// Tests del identificador de tarjeta en el Excel de movimientos («Información de movimientos de
// tarjetas» de Kutxabank). Los datos reproducen el fichero REAL que descarga Alberto: el Excel NO
// trae el número de tarjeta en ninguna cabecera — solo dentro del concepto de la liquidación.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { identificarTarjetaExcel, comoExtractoTarjeta } from './extracto-tarjeta-excel.ts'
import { dedupeHash, type ExtractoN43, type MovimientoN43 } from './norma43.ts'
import { parseTarjetaPdfTexto } from './extracto-tarjeta-pdf.ts'

const mov = (fecha: string, concepto: string, importe: number): MovimientoN43 => ({
  fechaOperacion: fecha, fechaValor: fecha, importe,
  conceptoComun: '', concepto, contraparte: concepto, referencia: '',
})

const extracto = (movimientos: MovimientoN43[]): ExtractoN43 => ({
  ccc: 'CUENTA-IMPORTADA', banco: 'Importado (Excel)', divisa: 'EUR',
  saldoInicial: 0, saldoFinal: null,
  fechaInicio: movimientos[0]?.fechaOperacion ?? null,
  fechaFin: movimientos[movimientos.length - 1]?.fechaOperacion ?? null,
  movimientos,
})

const TARJETA = extracto([
  mov('2026-07-01', 'PAGO RECIBO 4662032019750300', 2698.22),
  mov('2026-07-01', 'DEVOLUCION CIRCULO MERCANTIL', 35),
  mov('2026-07-01', 'COMPRA EN ZAPATERIA CERRAJERIA', -8),
  mov('2026-07-03', 'COMPRA EN MERCADONA COLMENA SEVILLA', -187.67),
  mov('2026-07-03', 'COMPRA EN DIA SEVILLA 2260', -0.99),
])

test('Excel de tarjeta → ccc derivado del PAN de la liquidación (mismo que el PDF)', () => {
  const t = identificarTarjetaExcel(TARJETA)
  assert.deepEqual(t, { ccc: 'TARJETA-KUTXA-0300', pan: '4662032019750300' })
})

test('extracto de cuenta corriente → null (no es de tarjeta)', () => {
  const corriente = extracto([
    mov('2026-07-01', 'TRANSF. 2100 FACTURA LAVANDERIA', -780.1),
    mov('2026-07-02', 'RECIBO ENDESA ENERGIA XXI', -84.5),
    mov('2026-07-03', 'TRANSFERENCIA RECIBIDA BOOKING.COM', 1355.24),
    mov('2026-07-04', 'CUOTA PTMO 000123456', -412.08),
  ])
  assert.equal(identificarTarjetaExcel(corriente), null)
})

// Sin liquidación no hay número de tarjeta en ningún sitio: preguntar es mejor que adivinar.
test('extracto de tarjeta SIN línea de liquidación → null (no se adivina la cuenta)', () => {
  const sinRecibo = extracto(TARJETA.movimientos.filter(m => !m.concepto.startsWith('PAGO RECIBO')))
  assert.equal(identificarTarjetaExcel(sinRecibo), null)
})

test('dos tarjetas mezcladas en el mismo fichero → null (ambiguo)', () => {
  const mezcla = extracto([
    ...TARJETA.movimientos,
    mov('2026-07-01', 'PAGO RECIBO 4662032019650302', 617.87),
  ])
  assert.equal(identificarTarjetaExcel(mezcla), null)
})

test('fichero corto o vacío → null', () => {
  assert.equal(identificarTarjetaExcel(extracto([])), null)
  assert.equal(identificarTarjetaExcel(null), null)
  assert.equal(identificarTarjetaExcel(undefined), null)
})

test('comoExtractoTarjeta pone el ccc y deja el banco vacío (no renombra la cuenta existente)', () => {
  const e = comoExtractoTarjeta(TARJETA, 'TARJETA-KUTXA-0300')
  assert.equal(e.ccc, 'TARJETA-KUTXA-0300')
  assert.equal(e.banco, '')
  assert.equal(e.movimientos.length, TARJETA.movimientos.length)
})

// 🚨 Invariante que evita duplicar el mes entero: el MISMO extracto subido en PDF y en Excel tiene
// que producir los MISMOS dedupe_hash. El Excel trae «fecha valor» (distinta de la de operación en
// la mayoría de las compras) y el PDF no; sin normalizar, subir los dos ficheros metía las compras
// dos veces. Si alguien vuelve a meter fechaValor/saldo del Excel en el import de tarjeta, este test
// se pone rojo.
test('mismo extracto en PDF y en Excel → dedupe_hash idénticos (no se duplica el mes)', () => {
  const TEXTO_PDF = `Número: 4662032019750300
01/07/2026******20197503002.698,22 €PAGO RECIBO 4662032019750300
01/07/2026******201975030035,00 €DEVOLUCION CIRCULO MERCANTIL
01/07/2026******2019750300COMPRA EN ZAPATERIA CERRAJERIA-8,00 €
03/07/2026******2019750300COMPRA EN MERCADONA COLMENA SEVILLA-187,67 €
03/07/2026******2019750300COMPRA EN DIA SEVILLA 2260-0,99 €`
  const [pdf] = parseTarjetaPdfTexto(TEXTO_PDF)

  // El Excel del mismo mes: mismas líneas, pero con fecha valor propia y saldo, como lo da el banco.
  const excel = comoExtractoTarjeta(extracto(TARJETA.movimientos.map(m => ({
    ...m, fechaValor: '2026-07-06', saldoPosterior: 1234.56,
  }))), 'TARJETA-KUTXA-0300')

  const hPdf = pdf.movimientos.map(dedupeHash).sort()
  const hXls = excel.movimientos.map(dedupeHash).sort()
  assert.deepEqual(hXls, hPdf)
})
