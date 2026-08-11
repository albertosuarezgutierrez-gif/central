// Tests de parseBooking. Runner: `node --test` (type-stripping; booking.ts solo tiene un
// `import type`, así que es puro en runtime). Fija el formato REAL de las facturas de Booking
// (texto extraído de PDFs reales del Drive de Alberto) para que un cambio de regex se note.
import { test } from 'node:test'
import assert from 'node:assert/strict'

import { esBooking, parseBooking, bookingFingerprint } from './booking.ts'

// Texto tal cual lo saca pdf-parse de una factura real de Booking (nov-2024).
const FACTURA_NORMAL = `[1621657390] 82145718 Empresario individual Alberto Suarez
Booking.com B.V. Oosterdokskade 163 1011 DL Amsterdam Países Bajos NIF-IVA: NL805734958B01 Inscrito en los Países Bajos con número: 31047344 https://www.booking.com
ID del establecimiento: 2624604 Número de factura: 1621657390 Fecha: 03/12/2024 Período: 01/11/2024 - 30/11/2024
FACTURA
Descripción Facturación Comisión
Cargo por pago EUR 22,75
Reservas EUR 1.781,25 EUR 302,81
21% de IVA sobre EUR 325,56 EUR 68,37
Comisión Total EUR 393,93
El plazo de pago vence: 16 de diciembre de 2024`

// Caso "inversión del sujeto pasivo": sin línea de IVA (iva=0, base=total).
const FACTURA_SIN_IVA = `[1609015629] 67260119 Empresario individual Alberto Suarez
Booking.com B.V. NIF-IVA: NL805734958B01 https://www.booking.com
ID del establecimiento: 2624604 Número de factura: 1609015629 Fecha: 03/05/2024 Período: 01/04/2024 - 30/04/2024
FACTURA
Reservas EUR 3.744,33 EUR 636,54
Cargo por pago EUR 41,21
Comisión Total EUR 677,75
* IVA con mecanismo de 'inversión del sujeto pasivo'`

test('esBooking detecta una factura de Booking por dominio y por NIF holandés', () => {
  assert.equal(esBooking(FACTURA_NORMAL), true)
  assert.equal(esBooking('cualquier texto', 'noreply@booking.com'), true)
  assert.equal(esBooking('Factura de Endesa, luz del piso'), false)
})

test('parseBooking lee total, establecimiento, nº factura y fecha (fin de período)', () => {
  const { establishmentId, factura } = parseBooking(FACTURA_NORMAL)
  assert.equal(establishmentId, '2624604')
  assert.equal(factura.total, 393.93)
  assert.equal(factura.numero_factura, '1621657390')
  assert.equal(factura.fecha, '2024-11-30') // fin del período, no la fecha de emisión
  assert.equal(factura.proveedor, 'Booking.com')
  assert.equal(factura.nif_proveedor, 'NL805734958B01')
  // IVA: "21% de IVA sobre EUR 325,56 EUR 68,37"
  assert.equal(factura.iva_porcentaje, 21)
  assert.equal(factura.base_imponible, 325.56)
  assert.equal(factura.iva, 68.37)
})

test('parseBooking con inversión del sujeto pasivo: iva=0, base=total', () => {
  const { factura } = parseBooking(FACTURA_SIN_IVA)
  assert.equal(factura.total, 677.75)
  assert.equal(factura.iva, 0)
  assert.equal(factura.iva_porcentaje, 0)
  assert.equal(factura.base_imponible, 677.75)
})

test('bookingFingerprint es estable por establecimiento (cada piso aprende su regla)', () => {
  assert.equal(bookingFingerprint('2624604'), 'booking:2624604')
  assert.equal(bookingFingerprint(null), 'booking:desconocido')
})
