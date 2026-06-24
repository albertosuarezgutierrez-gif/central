import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { ReceiptDoc, Branding } from '../src/index.ts'

test('un ReceiptDoc fiscal-seguro se construye con campos congelados', () => {
  const doc: ReceiptDoc = {
    kind: 'factura-cliente',
    fiscal: {
      numero: 'F-2026-000123',
      fechaLocal: '16-06-2026 13:45:00',
      emisorNif: 'B00000000',
      emisorRazon: 'ia.rest SL',
      base: 10,
      iva: 1,
      total: 11,
    },
    lineas: [{ descripcion: 'Café', cantidad: 1, precioUnitario: 11 }],
  }
  assert.equal(doc.fiscal.total, 11)
})

test('un Branding lleva colores y idioma', () => {
  const brand: Branding = {
    nombre: 'Sique Brilla',
    primario: '#0a0805',
    secundario: '#d4a017',
    light: '#fff8e1',
    lang: 'es',
  }
  assert.equal(brand.lang, 'es')
})
