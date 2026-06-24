import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { ReceiptDoc } from '../src/index.ts'

test('ReceiptDoc admite campos de presentación no-fiscales opcionales', () => {
  const doc: ReceiptDoc = {
    kind: 'factura-cliente',
    fiscal: {
      numero: 'F-2026-000123', fechaLocal: '16-06-2026 13:45:00',
      emisorNif: 'B00000000', emisorRazon: 'Empresa SL',
      base: 10, iva: 2.1, total: 12.1,
    },
    lineas: [{ descripcion: 'Limpieza', cantidad: 1, precioUnitario: 10, detalle: 'Piso A' }],
    presentacion: {
      estado: 'emitida',
      fechaEmision: '2026-06-16', periodoDesde: '2026-06-01', periodoHasta: '2026-06-30',
      vencimiento: '2026-07-16', concepto: 'Servicios de junio',
      emisorEmail: 'hola@empresa.es', emisorTelefono: '600000000', emisorIban: 'ES00',
      emisorDireccion: 'Calle 1', destDireccion: 'Calle 2', notaPie: 'Gracias',
    },
  }
  assert.equal(doc.presentacion?.estado, 'emitida')
  assert.equal(doc.lineas[0].detalle, 'Piso A')
})
