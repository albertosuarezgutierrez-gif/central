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

// ── Clasificación del documento (04/10/2026) ─────────────────────────────────
const HOY2 = new Date('2026-10-04T06:00:00Z')

test('circular de la Asociación de Corredores (50 €, cuota de inscripción) → no_es_factura', () => {
  const d = decidirAvisoPago(
    { fecha: '2026-10-04', proveedor: 'Asociación de Corredores de Seguros', tipo_documento: 'circular_informativa' },
    TITULARES, HOY2,
  )
  assert.equal(d.pagar, false)
  assert.equal(d.pagar === false && d.motivo, 'no_es_factura')
})

test('donativo a una fundación → no_es_factura', () => {
  const d = decidirAvisoPago({ fecha: '2026-09-12', proveedor: 'Fundación SS.CC.', tipo_documento: 'certificado_donativo' }, TITULARES, HOY2)
  assert.equal(d.pagar === false && d.motivo, 'no_es_factura')
})

test('presupuesto/proforma y tipo con mayúsculas o guiones también se aparta', () => {
  assert.equal(decidirAvisoPago({ fecha: '2026-10-01', tipo_documento: 'Presupuesto' }, TITULARES, HOY2).pagar, false)
  assert.equal(decidirAvisoPago({ fecha: '2026-10-01', tipo_documento: 'formulario-inscripcion' }, TITULARES, HOY2).pagar, false)
})

test('factura de Anthropic con nº e IVA → pasa con Pagar', () => {
  const d = decidirAvisoPago(
    { fecha: '2026-10-04', proveedor: 'Anthropic, PBC', tipo_documento: 'factura', numero_factura: 'ABC-1234', base_imponible: 140.5, iva: 29.5 },
    TITULARES, HOY2,
  )
  assert.deepEqual(d, { pagar: true, permitirPagar: true })
})

test('recibo sin nº ni IVA → pasa pero SIN Pagar', () => {
  const d = decidirAvisoPago({ fecha: '2026-10-04', proveedor: 'Alguien', tipo_documento: 'recibo' }, TITULARES, HOY2)
  assert.deepEqual(d, { pagar: true, permitirPagar: false, motivoRevision: 'sin_numero_ni_iva' })
})

test('recibo sin nº pero con IVA, o con nº pero sin IVA → permite Pagar', () => {
  assert.equal((decidirAvisoPago({ fecha: '2026-10-04', tipo_documento: 'recibo', iva: 21 }, TITULARES, HOY2) as any).permitirPagar, true)
  assert.equal((decidirAvisoPago({ fecha: '2026-10-04', tipo_documento: 'recibo', numero_factura: 'R-1' }, TITULARES, HOY2) as any).permitirPagar, true)
})

test('tipo_documento null/ausente → no aparta por esto (comportamiento anterior)', () => {
  const d = decidirAvisoPago({ fecha: '2026-10-04', proveedor: 'Anthropic', tipo_documento: null, numero_factura: 'X-1' }, TITULARES, HOY2)
  assert.equal(d.pagar, true)
  assert.equal(decidirAvisoPago({ fecha: '2026-10-04', proveedor: 'Anthropic', numero_factura: 'X-1' }, TITULARES, HOY2).pagar, true)
})

test('los motivos existentes mandan sobre el tipo (antigua)', () => {
  const d = decidirAvisoPago({ fecha: '2022-01-01', tipo_documento: 'otro' }, TITULARES, HOY2)
  assert.equal(d.pagar === false && d.motivo, 'antigua')
})

test('tipo «otro» no aparta: pasa sin Pagar y con motivo «tipo_dudoso»', () => {
  const d = decidirAvisoPago({ fecha: '2026-10-04', proveedor: 'Alguien', tipo_documento: 'otro', numero_factura: 'X-1', iva: 21 }, TITULARES, HOY2)
  assert.deepEqual(d, { pagar: true, permitirPagar: false, motivoRevision: 'tipo_dudoso' })
  assert.equal(decidirAvisoPago({ fecha: '2026-10-04', tipo_documento: 'presupuesto' }, TITULARES, HOY2).pagar, false)
  const s = decidirAvisoPago({ fecha: '2026-10-04', tipo_documento: 'recibo' }, TITULARES, HOY2) as any
  assert.equal(s.motivoRevision, 'sin_numero_ni_iva')
})
