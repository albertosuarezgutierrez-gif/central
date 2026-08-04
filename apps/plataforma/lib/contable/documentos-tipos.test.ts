// apps/plataforma/lib/contable/documentos-tipos.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { interpretarExtraccion, resumenDocumento, refFactura, accionConciliar } from './documentos-tipos.ts'

test('source none → no leído (no inventa nada)', () => {
  const r = interpretarExtraccion({ total: 42, fecha: '2026-05-01' }, 'none')
  assert.equal(r.ok, false)
})

test('factura legible (texto) → estructurada y normalizada', () => {
  const r = interpretarExtraccion(
    { proveedor: '  Endesa  ', fecha: '2026-05-10', total: -84.5, numero_factura: 'F-1', concepto: 'Luz' },
    'text',
  )
  assert.equal(r.ok, true)
  if (r.ok) {
    assert.equal(r.factura.proveedor, 'Endesa')
    assert.equal(r.factura.total, 84.5)         // abs
    assert.equal(r.factura.fecha, '2026-05-10')
    assert.equal(r.factura.numero, 'F-1')
  }
})

test('imagen (visión) sin importe → sin datos (nunca inventa importe)', () => {
  const r = interpretarExtraccion({ proveedor: 'X', fecha: '2026-05-10', total: null }, 'vision')
  assert.equal(r.ok, false)
})

test('importe 0 → sin datos', () => {
  const r = interpretarExtraccion({ proveedor: 'X', fecha: '2026-05-10', total: 0 }, 'text')
  assert.equal(r.ok, false)
})

test('fecha inválida → sin datos', () => {
  const r = interpretarExtraccion({ proveedor: 'X', fecha: 'ayer', total: 10 }, 'vision')
  assert.equal(r.ok, false)
})

test('proveedor vacío → fallback', () => {
  const r = interpretarExtraccion({ fecha: '2026-01-02', total: 10 }, 'text')
  assert.equal(r.ok, true)
  if (r.ok) assert.equal(r.factura.proveedor, 'Proveedor desconocido')
})

test('resumenDocumento con match pregunta si concilia', () => {
  const s = resumenDocumento(
    { proveedor: 'Endesa', fecha: '2026-05-10', total: 84.5, numero: 'F-1', concepto: null },
    { movId: 'abc', concepto: 'RECIBO ENDESA', importe: -84.5 },
  )
  assert.match(s, /Endesa/)
  assert.match(s, /84\.50/)
  assert.match(s, /concilio/i)
})

test('resumenDocumento sin match avisa que no cuadra', () => {
  const s = resumenDocumento(
    { proveedor: 'Endesa', fecha: '2026-05-10', total: 84.5, numero: null, concepto: null },
    null,
  )
  assert.match(s, /No encuentro/i)
})

test('refFactura corta y con prefijo doc:', () => {
  const r = refFactura({ proveedor: 'Endesa', fecha: '2026-05-10', total: 84.5, numero: 'F-1', concepto: null })
  assert.equal(r, 'doc:Endesa F-1')
})

test('accionConciliar sin match → null (no propone nada)', () => {
  assert.equal(accionConciliar({ proveedor: 'X', fecha: '2026-05-10', total: 10, numero: null, concepto: null }, null), null)
})

test('accionConciliar con match → propuesta con movId y ref', () => {
  const p = accionConciliar(
    { proveedor: 'Endesa', fecha: '2026-05-10', total: 84.5, numero: 'F-1', concepto: null },
    { movId: 'mov-1', concepto: 'RECIBO ENDESA', importe: -84.5 },
  )
  assert.ok(p)
  assert.equal(p!.tipo, 'conciliar')
  assert.equal(p!.params.movId, 'mov-1')
  assert.equal(p!.params.facturaRef, 'doc:Endesa F-1')
  assert.match(p!.resumen, /Endesa/)
})
