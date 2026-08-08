// apps/plataforma/lib/contable/documentos-tipos.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { interpretarExtraccion, resumenDocumento, refFactura, accionConciliar, matchDeCruce } from './documentos-tipos.ts'

const FACTURA = { proveedor: 'Endesa', fecha: '2026-05-10', total: 84.5, numero: 'F-1', concepto: null }
const MOV = { movId: 'mov-1', fecha: '2026-05-09', concepto: 'RECIBO ENDESA', importe: -84.5, banco: 'BBVA' }
const COBERTURA = [{ banco: 'BBVA', ultima: '2026-05-20' }, { banco: 'Kutxabank', ultima: '2026-05-08' }]

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

test('resumenDocumento con match pregunta si concilia (y el dinero va en formato español)', () => {
  const s = resumenDocumento(FACTURA, { estado: 'match', mov: MOV })
  assert.match(s, /Endesa/)
  assert.match(s, /84,50€/)
  assert.match(s, /10\/05\/2026/)
  assert.match(s, /concilio/i)
})

test('sin_match dice que SÍ ha mirado y hasta dónde llegan los extractos', () => {
  const s = resumenDocumento(FACTURA, { estado: 'sin_match', cobertura: COBERTURA })
  assert.match(s, /He mirado/i)
  assert.doesNotMatch(s, /todavía NO puedo/i)
  assert.match(s, /BBVA hasta el 20\/05\/2026/)
})

// El fallo fundacional (05 y 07/08/2026): la factura era posterior al último movimiento que había
// llegado del banco, y el agente contestaba «no encuentro un movimiento que cuadre» — afirmando una
// ausencia que no había podido comprobar.
test('sin_cobertura NO afirma que el cargo no exista: dice que aún no ha llegado', () => {
  const s = resumenDocumento(FACTURA, { estado: 'sin_cobertura', cobertura: COBERTURA })
  assert.match(s, /Todavía NO puedo decirte/i)
  assert.match(s, /Kutxabank hasta el 08\/05\/2026/)
  assert.doesNotMatch(s, /no hay ninguno/i)
})

test('ya_conciliado no se confunde con "no lo encuentro"', () => {
  const s = resumenDocumento(FACTURA, { estado: 'ya_conciliado', mov: MOV })
  assert.match(s, /ya está conciliado/i)
  assert.match(s, /09\/05\/2026/)
  assert.doesNotMatch(s, /no encuentro/i)
})

test('fuera_de_ventana propone el cargo lejano como pregunta', () => {
  const s = resumenDocumento(FACTURA, { estado: 'fuera_de_ventana', mov: { ...MOV, fecha: '2026-06-08' }, dias: 29 })
  assert.match(s, /29 días/)
  assert.match(s, /¿Es ese\?/)
})

test('matchDeCruce solo propone acción sobre un cargo conciliable', () => {
  assert.equal(matchDeCruce({ estado: 'match', mov: MOV })!.movId, 'mov-1')
  assert.equal(matchDeCruce({ estado: 'fuera_de_ventana', mov: MOV, dias: 20 })!.movId, 'mov-1')
  assert.equal(matchDeCruce({ estado: 'ya_conciliado', mov: MOV }), null)
  assert.equal(matchDeCruce({ estado: 'sin_cobertura', cobertura: COBERTURA }), null)
  assert.equal(matchDeCruce({ estado: 'sin_match', cobertura: [] }), null)
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
  assert.match(p!.resumen, /84,50€/)
})
