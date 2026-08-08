// apps/plataforma/lib/contable/documento-clase.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { detectarListadoMovimientos } from './documento-clase.ts'

// Texto tipo "movimientos de la cuenta" (el PDF que Alberto subió tres veces el 07/08/2026).
const EXTRACTO = `
Movimientos de la cuenta ES90 2095 8306 1091 7255 0855
Fecha       Concepto                                   Importe      Saldo
03/08/2026  TRANSF. 2100 FACTURA LAVANDERIA JULIO      -780,10      12.402,55
04/08/2026  RECIBO ENDESA ENERGIA XXI                   -84,50      12.318,05
04/08/2026  COMPRA EN MERCADONA SEVILLA                 -63,17      12.254,88
05/08/2026  TRANSFERENCIA RECIBIDA BOOKING.COM        1.355,24      13.610,12
05/08/2026  RECIBO SEGURO HOGAR OCCIDENT               -119,90      13.490,22
06/08/2026  CUOTA PTMO 000123456                       -412,08      13.078,14
`

test('extracto de cuenta → listado detectado con rango de fechas', () => {
  const r = detectarListadoMovimientos(EXTRACTO)
  assert.ok(r)
  assert.equal(r!.lineas, 6)
  assert.equal(r!.desde, '2026-08-03')
  assert.equal(r!.hasta, '2026-08-06')
})

test('factura normal (una fecha, un total) → NO es listado', () => {
  const factura = `
FACTURA 47/2026
INSTALACIONES ELÉCTRICAS, PORTEROS Y ANTENAS
Fecha: 06/08/2026
Base imponible      230,00
IVA 21%              48,30
TOTAL               278,30
`
  assert.equal(detectarListadoMovimientos(factura), null)
})

test('factura con detalle de líneas fechadas pero por debajo del umbral → NO es listado', () => {
  const minuta = `
Minuta de honorarios
02/03/2026  Consulta inicial        120,00
05/03/2026  Redacción de contrato   340,00
11/03/2026  Comparecencia            90,00
TOTAL                               550,00
`
  assert.equal(detectarListadoMovimientos(minuta), null)
})

// Una factura detallada trae muchas líneas con importe pero pocas fechas distintas. El detector solo
// entra cuando la extracción YA ha fallado, así que un falso positivo aquí le diría a Alberto «esto
// no es una factura» sobre una factura de verdad.
test('factura con muchas líneas pero de una sola fecha → NO es listado', () => {
  const telefonia = `
FACTURA DIGI · Periodo 01/07/2026 - 31/07/2026
01/07/2026  Cuota línea móvil 1      12,00
01/07/2026  Cuota línea móvil 2      12,00
01/07/2026  Cuota fibra              22,00
01/07/2026  Servicios adicionales     3,50
01/07/2026  Descuento               -5,00
01/07/2026  IVA 21%                  9,14
TOTAL                                53,64
`
  assert.equal(detectarListadoMovimientos(telefonia), null)
})

test('texto vacío o nulo → null (no inventa una clase)', () => {
  assert.equal(detectarListadoMovimientos(''), null)
  assert.equal(detectarListadoMovimientos(undefined), null)
  assert.equal(detectarListadoMovimientos(null), null)
})

test('números sin coma decimal no cuentan como importe (nº de cuenta, referencias)', () => {
  const ruido = `
01/01/2026  REFERENCIA 4662032019650302
02/01/2026  REFERENCIA 4662032019650303
03/01/2026  REFERENCIA 4662032019650304
04/01/2026  REFERENCIA 4662032019650305
05/01/2026  REFERENCIA 4662032019650306
06/01/2026  REFERENCIA 4662032019650307
`
  assert.equal(detectarListadoMovimientos(ruido), null)
})

test('fechas de dos dígitos de año se normalizan a 20xx', () => {
  const r = detectarListadoMovimientos(`
01/02/26  PAGO A  -10,00
02/02/26  PAGO B  -11,00
03/02/26  PAGO C  -12,00
04/02/26  PAGO D  -13,00
05/02/26  PAGO E  -14,00
`)
  assert.ok(r)
  assert.equal(r!.desde, '2026-02-01')
  assert.equal(r!.hasta, '2026-02-05')
})
