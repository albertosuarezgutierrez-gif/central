// Guardia de contabilización. Cepos vistos FALLAR (05/11/2026) y restaurados:
// (1) en puedeContabilizar aceptar `lista` sin mirar `caseCuadra` → rojo «lista sin case».
// (2) en puedeContabilizar aceptar `confirmada` sin `confirmadoPor` → rojo «confirmada sin persona».
// (3) en estadoTrasCase devolver 'lista' con null → rojo «null no es cuadrar».
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { estadoTrasCase, puedeContabilizar, puedeTransicionar } from '../src/index.ts'

test('solo contabiliza con case que cuadra o confirmación de una persona', () => {
  assert.deepEqual(puedeContabilizar({ tipo: 'factura', estado: 'lista', caseCuadra: true, confirmadoPor: null, extraccionOrigen: 'xml' }), { contabilizar: true, via: 'case' })
  assert.deepEqual(puedeContabilizar({ tipo: 'factura', estado: 'confirmada', caseCuadra: false, confirmadoPor: 'u1' }), { contabilizar: true, via: 'persona' })
})
test('lista sin case', () => {
  assert.equal(puedeContabilizar({ tipo: 'factura', estado: 'lista', caseCuadra: null, confirmadoPor: null }).contabilizar, false)
  assert.equal(puedeContabilizar({ tipo: 'factura', estado: 'lista', caseCuadra: false, confirmadoPor: null }).contabilizar, false)
})
test('confirmada sin persona', () => {
  assert.equal(puedeContabilizar({ tipo: 'factura', estado: 'confirmada', caseCuadra: true, confirmadoPor: null }).contabilizar, false)
  assert.equal(puedeContabilizar({ tipo: 'factura', estado: 'confirmada', caseCuadra: true, confirmadoPor: '  ' }).contabilizar, false)
})
test('revisar, extraida, ilegible, rechazada, contabilizada y albaranes: nunca', () => {
  for (const estado of ['revisar', 'extraida', 'ilegible', 'rechazada', 'recibida', 'contabilizada']) {
    assert.equal(puedeContabilizar({ tipo: 'factura', estado, caseCuadra: true, confirmadoPor: 'u1' }).contabilizar, false, estado)
  }
  assert.equal(puedeContabilizar({ tipo: 'albaran', estado: 'verificado', caseCuadra: true, confirmadoPor: 'u1' }).contabilizar, false)
})
test('case que cuadra: solo el origen XML contabiliza sin persona; la lectura por IA no (salvo permiso del dueño)', () => {
  assert.equal(estadoTrasCase(true, 'xml'), 'lista')
  assert.equal(estadoTrasCase(true, 'ia'), 'revisar')
  assert.equal(estadoTrasCase(true, 'persona'), 'revisar')
  assert.equal(estadoTrasCase(true, null), 'revisar')
  assert.equal(estadoTrasCase(true, 'ia', { autoContabilizarLecturaIa: true }), 'lista')
  assert.equal(estadoTrasCase(false, 'xml'), 'revisar')
  const base = { tipo: 'factura', estado: 'lista', caseCuadra: true, confirmadoPor: null } as const
  assert.equal(puedeContabilizar({ ...base, extraccionOrigen: 'xml' }).contabilizar, true)
  assert.equal(puedeContabilizar({ ...base, extraccionOrigen: 'ia' }).contabilizar, false)
  assert.equal(puedeContabilizar({ ...base, extraccionOrigen: 'ia', autoContabilizarLecturaIa: true }).contabilizar, true)
  assert.equal(puedeContabilizar({ tipo: 'factura', estado: 'confirmada', caseCuadra: true, confirmadoPor: 'u1', extraccionOrigen: 'ia' }).contabilizar, true)
})
test('transiciones reales: leer de nuevo (ilegible→extraida) y rechazar una recibida', () => {
  assert.ok(puedeTransicionar('factura', 'ilegible', 'extraida'))
  assert.ok(puedeTransicionar('factura', 'recibida', 'rechazada'))
  assert.ok(!puedeTransicionar('factura', 'recibida', 'contabilizada'))
})
test('null no es cuadrar', () => {
  assert.equal(estadoTrasCase(true, 'xml'), 'lista')
  assert.equal(estadoTrasCase(false), 'revisar')
  assert.equal(estadoTrasCase(null), 'revisar')
})
test('transiciones: de revisar solo sale por persona (confirmada/rechazada) o re-case (lista)', () => {
  assert.ok(puedeTransicionar('factura', 'revisar', 'confirmada'))
  assert.ok(!puedeTransicionar('factura', 'revisar', 'contabilizada'))
  assert.ok(!puedeTransicionar('factura', 'extraida', 'contabilizada'))
  assert.ok(puedeTransicionar('albaran', 'recibido', 'verificado'))
  assert.ok(!puedeTransicionar('albaran', 'verificado', 'recibido'))
})
