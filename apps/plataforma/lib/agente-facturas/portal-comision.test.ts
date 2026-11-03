import test from 'node:test'
import assert from 'node:assert/strict'
import { esFacturaComisionPortal } from './portal-comision.ts'

test('caso real: Booking.com B.V. «Cargo por servicio de los pagos, Reservas» → comisión de portal', () => {
  assert.equal(esFacturaComisionPortal({ proveedor: 'Booking.com B.V.', concepto: 'Cargo por servicio de los pagos, Reservas' }), true)
})

test('comisiones de Airbnb / Expedia / Vrbo → true', () => {
  assert.equal(esFacturaComisionPortal({ proveedor: 'Airbnb Ireland UC', concepto: 'Service fee' }), true)
  assert.equal(esFacturaComisionPortal({ proveedor: 'Expedia', concepto: 'Comisión por reservas' }), true)
  assert.equal(esFacturaComisionPortal({ proveedor: 'Vrbo', concepto: 'Commission' }), true)
})

test('suscripciones a software de pisos SÍ son gasto → false', () => {
  assert.equal(esFacturaComisionPortal({ proveedor: 'Smoobu', concepto: 'Suscripción mensual, integración Booking.com y comisión de canal' }), false)
  assert.equal(esFacturaComisionPortal({ proveedor: 'PriceLabs', concepto: 'Dynamic pricing subscription' }), false)
})

test('portal sin concepto de comisión (otro servicio) → false', () => {
  assert.equal(esFacturaComisionPortal({ proveedor: 'Booking.com B.V.', concepto: 'Publicidad' }), false)
})
