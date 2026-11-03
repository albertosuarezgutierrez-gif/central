import { test } from 'node:test'
import assert from 'node:assert/strict'
import { decidirPorTipo, normalizaTipoDocumento, AVISO_TIPO_NULL, AVISO_TIPO_OTRO } from './tipo-documento.ts'

test('tipo null NO se acepta como factura: a revisión con aviso (solicitud de inscripción, 03/11/2026)', () => {
  const d = decidirPorTipo(null, 50)
  assert.equal(d.accion, 'revisar')
  assert.equal(d.accion === 'revisar' && d.aviso, AVISO_TIPO_NULL)
  assert.equal(decidirPorTipo('', 50).accion, 'revisar')
  assert.equal(decidirPorTipo(undefined, 50).accion, 'revisar')
})

test('factura, recibo, ticket y justificante son gasto', () => {
  for (const t of ['factura', 'Recibo', 'ticket', 'justificante de pago', 'certificado_donativo']) {
    assert.equal(decidirPorTipo(t, 10).accion, 'gasto', t)
  }
})

test('presupuesto, proforma, solicitud, liquidación, resumen y aviso se OMITEN', () => {
  for (const t of ['presupuesto', 'proforma', 'solicitud_inscripcion', 'liquidacion_comisiones', 'resumen_pagos', 'aviso_circular']) {
    const d = decidirPorTipo(t, 659.43)
    assert.equal(d.accion, 'omitir', t)
  }
})

test('los nombres del prompt anterior se reconocen (filas viejas de raw_extraction)', () => {
  assert.equal(normalizaTipoDocumento('circular_informativa'), 'aviso_circular')
  assert.equal(normalizaTipoDocumento('formulario_inscripcion'), 'solicitud_inscripcion')
  assert.equal(normalizaTipoDocumento('Cotización'), 'presupuesto')
  assert.equal(decidirPorTipo('circular_informativa', 0).accion, 'omitir')
})

test('un tipo desconocido cuenta como «otro», nunca como factura', () => {
  assert.equal(normalizaTipoDocumento('carta de bienvenida'), 'otro')
  const d = decidirPorTipo('carta de bienvenida', 45)
  assert.equal(d.accion === 'revisar' && d.aviso, AVISO_TIPO_OTRO)
})

test('«otro» sin importe se omite (la IA lo leyó y no hay cantidad); con importe va a revisión', () => {
  assert.equal(decidirPorTipo('otro', null).accion, 'omitir')
  assert.equal(decidirPorTipo('otro', 0).accion, 'omitir')
  assert.equal(decidirPorTipo('otro', 45).accion, 'revisar')
})
