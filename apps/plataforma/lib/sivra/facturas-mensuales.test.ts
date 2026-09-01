import { test } from 'node:test'
import assert from 'node:assert/strict'
import { facturasMensualesFaltantes } from './facturas-mensuales.ts'

const GIRALDILLO = 'Lavandería El Giraldillo'
const SB = 'Si que Brilla (limpieza)'

test('caso real AFV-11625: mayo sin factura ni pago → avisa a partir del día 5 de junio', () => {
  const estado = [
    // última factura ingerida: la de marzo (31/03); último pago: abril (27/05 fue abril... aquí simulamos que no llegó)
    { nombre: GIRALDILLO, ultimaFactura: '2026-03-31', ultimoPago: '2026-04-06' },
  ]
  assert.deepEqual(facturasMensualesFaltantes('2026-06-05', estado), [GIRALDILLO])
})

test('con el pago del mes anterior visto en el banco NO avisa aunque falte la factura en gastos', () => {
  const estado = [{ nombre: GIRALDILLO, ultimaFactura: '2026-03-31', ultimoPago: '2026-05-27' }]
  assert.deepEqual(facturasMensualesFaltantes('2026-06-05', estado), [])
})

test('con la factura del mes anterior en gastos NO avisa aunque siga sin pagarse', () => {
  const estado = [{ nombre: GIRALDILLO, ultimaFactura: '2026-05-29', ultimoPago: '2026-04-06' }]
  assert.deepEqual(facturasMensualesFaltantes('2026-06-10', estado), [])
})

test('antes del día de gracia no avisa (la factura del mes previo puede no haber llegado)', () => {
  const estado = [{ nombre: GIRALDILLO, ultimaFactura: null, ultimoPago: null }]
  assert.deepEqual(facturasMensualesFaltantes('2026-06-04', estado), [])
})

test('proveedor nunca visto (todo null) → avisa pasado el día de gracia', () => {
  const estado = [{ nombre: SB, ultimaFactura: null, ultimoPago: null }]
  assert.deepEqual(facturasMensualesFaltantes('2026-06-05', estado), [SB])
})

test('varios proveedores: solo sale el que falta', () => {
  const estado = [
    { nombre: GIRALDILLO, ultimaFactura: '2026-06-30', ultimoPago: '2026-07-05' },
    { nombre: SB, ultimaFactura: '2026-05-31', ultimoPago: '2026-06-02' },
  ]
  // hoy 28/07: mes anterior = junio. Giraldillo tiene factura 30/06 → ok; SB su último dato es de mayo/2-jun → ok (pago 02/06 >= 01/06)
  assert.deepEqual(facturasMensualesFaltantes('2026-07-28', estado), [])
})

test('cruce de año: en enero el mes anterior es diciembre', () => {
  const estado = [{ nombre: GIRALDILLO, ultimaFactura: '2026-11-30', ultimoPago: '2026-11-15' }]
  assert.deepEqual(facturasMensualesFaltantes('2027-01-07', estado), [GIRALDILLO])
  const ok = [{ nombre: GIRALDILLO, ultimaFactura: '2026-12-30', ultimoPago: null }]
  assert.deepEqual(facturasMensualesFaltantes('2027-01-07', ok), [])
})
