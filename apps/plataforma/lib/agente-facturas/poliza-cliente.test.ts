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

test('Allianz Moto a nombre de Alberto como comisionista («liquidación») → NO es gasto', () => {
  assert.equal(esDocumentoPolizaCliente({ proveedor: 'Allianz', concepto: 'Liquidación Allianz Moto', total: 251.47, cliente: 'Alberto Suárez Gutiérrez', nif_cliente: '28823484E' } as never), true)
  assert.equal(esDocumentoPolizaCliente({ proveedor: 'Allianz', concepto: 'Resumen de operaciones', cliente: 'Alberto Suárez Gutiérrez' }), true)
})

test('aseguradora fuera de la lista blanca con nombre de Alberto → duda; gastos_fijos la amplía', () => {
  assert.equal(esDocumentoPolizaCliente({ proveedor: 'Allianz', concepto: 'Recibo de prima póliza 777', cliente: 'Alberto Suárez Gutiérrez', nif_cliente: '28823484E' }), 'duda')
  assert.equal(esDocumentoPolizaCliente({ proveedor: 'Allianz', concepto: 'Recibo de prima póliza 777', cliente: 'Alberto Suárez Gutiérrez' }, [], ['777']), false)
})
