import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  assertFiscalIntegrity,
  formatFiscalNumber,
  FiscalIntegrityError,
} from '../src/index.ts'
import type { FiscalFields } from '../src/index.ts'

const fiscal: FiscalFields = {
  numero: 'F-2026-000123',
  fechaLocal: '16-06-2026 13:45:00',
  emisorNif: 'B00000000',
  emisorRazon: 'ia.rest SL',
  base: 10,
  iva: 1,
  total: 11,
  huella: 'ABC123HUELLA',
  qrData: 'https://prewww2.aeat.es/QR?nif=B00000000',
}

test('formatFiscalNumber agrupa miles con punto, coma decimal y 2 decimales', () => {
  assert.equal(formatFiscalNumber(11), '11,00')
  assert.equal(formatFiscalNumber(1234.5), '1.234,50')
})

test('pasa cuando todos los campos fiscales están en la salida', () => {
  const rendered = [
    'Factura F-2026-000123', 'NIF: B00000000',
    'Base 10,00', 'IVA 1,00', 'TOTAL 11,00',
    'ABC123HUELLA', 'https://prewww2.aeat.es/QR?nif=B00000000',
  ].join('\n')
  assert.doesNotThrow(() => assertFiscalIntegrity(fiscal, rendered))
})

test('falla cerrado si falta el total', () => {
  const rendered = 'Factura F-2026-000123 NIF: B00000000 Base 10,00 IVA 1,00 ABC123HUELLA https://prewww2.aeat.es/QR?nif=B00000000'
  assert.throws(() => assertFiscalIntegrity(fiscal, rendered), FiscalIntegrityError)
})

test('falla si la glosa contiene una cifra fiscal', () => {
  const rendered = [
    'Factura F-2026-000123', 'NIF: B00000000',
    'Base 10,00', 'IVA 1,00', 'TOTAL 11,00',
    'ABC123HUELLA', 'https://prewww2.aeat.es/QR?nif=B00000000',
  ].join('\n')
  const glosa = 'Gracias, su total de 11,00 le espera'
  assert.throws(() => assertFiscalIntegrity(fiscal, rendered, glosa), FiscalIntegrityError)
})

test('acepta una glosa sin cifras fiscales', () => {
  const rendered = [
    'Factura F-2026-000123', 'NIF: B00000000',
    'Base 10,00', 'IVA 1,00', 'TOTAL 11,00',
    'ABC123HUELLA', 'https://prewww2.aeat.es/QR?nif=B00000000',
  ].join('\n')
  const glosa = 'Gracias Ana, vuelve pronto a vernos'
  assert.doesNotThrow(() => assertFiscalIntegrity(fiscal, rendered, glosa))
})
