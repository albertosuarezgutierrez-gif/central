import { test } from 'node:test'
import assert from 'node:assert/strict'
import { esPresupuestoExtraido } from './clasificar.ts'

test('presupuesto leído por la IA no es factura aunque el texto diga «recibo» (caso ASISA 03/11/2026)', () => {
  assert.equal(esPresupuestoExtraido({ tipo_documento: 'presupuesto', concepto: 'Póliza vida' }), true)
  assert.equal(esPresupuestoExtraido({ tipo_documento: 'otro', concepto: 'Presupuesto póliza Asisa Vida Tranquilidad Protección Hipoteca' }), true)
  assert.equal(esPresupuestoExtraido({ tipo_documento: 'Cotización' }), true)
})

test('una factura normal no es presupuesto', () => {
  assert.equal(esPresupuestoExtraido({ tipo_documento: 'factura', concepto: 'Lavandería julio' }), false)
  assert.equal(esPresupuestoExtraido({ tipo_documento: null, concepto: 'Factura según presupuesto aceptado' }), false)
  assert.equal(esPresupuestoExtraido({}), false)
})
