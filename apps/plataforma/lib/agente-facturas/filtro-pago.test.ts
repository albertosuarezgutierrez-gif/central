// Tests de decidirAvisoPago. Runner: `node --test` (type-stripping; filtro-pago.ts es puro).
// Casos copiados de las filas reales de `facturas_proveedor` del 27-29/09/2026.
import { test } from 'node:test'
import assert from 'node:assert/strict'

import { decidirAvisoPago, DIAS_MAX_ANTIGUEDAD } from './filtro-pago.ts'

const TITULARES = [
  { nif: '28823484E', nombre: 'Alberto Suárez Gutiérrez' },
  { nif: 'B90446683', nombre: 'PUNTO Y COMA GESTION, S.L.' },
]
const HOY = new Date('2026-09-29T06:15:00Z')

test('factura de hace años (Ayuntamiento de Ayamonte, 2022) → antigua', () => {
  const d = decidirAvisoPago({ fecha: '2022-09-30', proveedor: 'Ayuntamiento de Ayamonte' }, TITULARES, HOY)
  assert.equal(d.pagar, false)
  assert.equal(d.pagar === false && d.motivo, 'antigua')
})

test('certificación de obra de GLOBAL 2 de abril de 2025 → antigua', () => {
  const d = decidirAvisoPago({ fecha: '2025-04-29', proveedor: 'GLOBAL 2 INSTALACIONES TECNICAS S.L.' }, TITULARES, HOY)
  assert.equal(d.pagar === false && d.motivo, 'antigua')
})

test('recibo de moto de Allianz sin destinatario identificado → aseguradora', () => {
  const d = decidirAvisoPago({ fecha: '2026-09-25', proveedor: 'Allianz, Compañía de Seguros y Reaseguros, S.A.' }, TITULARES, HOY)
  assert.equal(d.pagar === false && d.motivo, 'aseguradora')
})

test('prestación de Occident → aseguradora', () => {
  const d = decidirAvisoPago({ fecha: '2026-09-23', proveedor: 'Occident GCO, S.A.U. de Seguros y Reaseguros' }, TITULARES, HOY)
  assert.equal(d.pagar === false && d.motivo, 'aseguradora')
})

test('seguro de una aseguradora A TU NOMBRE sí se avisa', () => {
  const d = decidirAvisoPago(
    { fecha: '2026-09-25', proveedor: 'Allianz Seguros', cliente: 'Alberto Suárez Gutiérrez', nif_cliente: '28823484-E' },
    TITULARES, HOY,
  )
  assert.equal(d.pagar, true)
})

test('factura reciente de un proveedor normal (Asecon, Anthropic) → se avisa', () => {
  assert.equal(decidirAvisoPago({ fecha: '2026-09-22', proveedor: 'Anthropic Ireland, Limited' }, TITULARES, HOY).pagar, true)
  assert.equal(decidirAvisoPago({ fecha: '2026-07-06', proveedor: 'ASECON DESARROLLOS EMPRESARIALES, S.L.' }, TITULARES, HOY).pagar, true)
})

test('emitida por Punto y Coma a un cliente → emitida_por_ti', () => {
  const d = decidirAvisoPago(
    { fecha: '2026-09-20', proveedor: 'Punto y Coma Gestión SL', nif_proveedor: 'B90446683', cliente: 'Ayto. X', nif_cliente: 'P2101000A' },
    TITULARES, HOY,
  )
  assert.equal(d.pagar === false && d.motivo, 'emitida_por_ti')
})

test('NIF nuestro como proveedor SIN NIF de cliente no aparta (error del extractor, caso IONOS)', () => {
  const d = decidirAvisoPago({ fecha: '2026-09-20', proveedor: 'IONOS Cloud S.L.U.', nif_proveedor: '28823484E' }, TITULARES, HOY)
  assert.equal(d.pagar, true)
})

test('a nombre de un tercero por NIF → ajena', () => {
  const d = decidirAvisoPago({ fecha: '2026-09-20', proveedor: 'LUANSA', cliente: 'El Triunfo CB', nif_cliente: 'E26631895' }, TITULARES, HOY)
  assert.equal(d.pagar === false && d.motivo, 'ajena')
})

test('sin fecha, o fecha ilegible, no aparta', () => {
  assert.equal(decidirAvisoPago({ proveedor: 'Iberdrola' }, TITULARES, HOY).pagar, true)
  assert.equal(decidirAvisoPago({ fecha: '30/09/2022', proveedor: 'Iberdrola' }, TITULARES, HOY).pagar, true)
})

test('el límite de antigüedad es inclusivo', () => {
  const limite = new Date(HOY.getTime() - DIAS_MAX_ANTIGUEDAD * 86_400_000).toISOString().slice(0, 10)
  assert.equal(decidirAvisoPago({ fecha: limite, proveedor: 'Iberdrola' }, TITULARES, HOY).pagar, true)
})

test('sin titulares (BD caída) solo aparta por antigüedad o aseguradora, nunca por receptor', () => {
  const d = decidirAvisoPago({ fecha: '2026-09-20', proveedor: 'LUANSA', nif_cliente: 'E26631895' }, [], HOY)
  assert.equal(d.pagar, true)
})
