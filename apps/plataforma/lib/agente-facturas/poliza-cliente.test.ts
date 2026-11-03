import test from 'node:test'
import assert from 'node:assert/strict'
import { esDocumentoPolizaCliente } from './poliza-cliente.ts'

test('póliza de cliente (tomador distinto de Alberto/Pilar) → true (descartar)', () => {
  assert.equal(esDocumentoPolizaCliente({ concepto: 'Póliza 061145138', categoria: 'SEGURO', cliente: 'Juan Pérez López', nif_cliente: '12345678Z' }), true)
  assert.equal(esDocumentoPolizaCliente({ proveedor: 'Allianz', concepto: 'Recibo de prima', cliente: 'María Gómez' }), true)
})

test('Occident de un piso con tomador Alberto → false (es gasto)', () => {
  assert.equal(esDocumentoPolizaCliente({ proveedor: 'Occident', concepto: 'Seguro hogar piso', categoria: 'SEGURO', cliente: 'Alberto Suárez Gutiérrez', nif_cliente: '28823484E' }), false)
  assert.equal(esDocumentoPolizaCliente({ proveedor: 'ASISA', concepto: 'Recibo de prima', cliente: 'Pilar Piña Franco' }), false)
})

test('tomador desconocido o null → duda (no se descarta)', () => {
  assert.equal(esDocumentoPolizaCliente({ concepto: 'Póliza 061145138', categoria: 'SEGURO', cliente: null, nif_cliente: null }), 'duda')
  assert.equal(esDocumentoPolizaCliente({ proveedor: 'Mapfre', concepto: 'Recibo de prima', cliente: 'Cliente varios' }), 'duda')
})

test('un gasto cualquiera sin relación con seguros → false', () => {
  assert.equal(esDocumentoPolizaCliente({ proveedor: 'IONOS', concepto: 'Hosting', categoria: 'SOFTWARE', cliente: 'Otro' }), false)
})
