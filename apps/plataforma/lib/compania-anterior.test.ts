import test from 'node:test'
import assert from 'node:assert/strict'
import { companiaAnteriorDe, companiaLimpia } from './compania-anterior.ts'

test('compañía anterior: el historial declarado gana sobre la aseguradora de la oportunidad', () => {
  assert.equal(companiaAnteriorDe({ historialDeclarado: { companiaActual: ' Aseguradora   Alfa ' }, aseguradora: 'Aseguradora Beta', aseguradoraActual: true }), 'Aseguradora Alfa')
  assert.equal(companiaAnteriorDe({ historialDeclarado: { companiaActual: 'Aseguradora Alfa' }, aseguradora: 'Aseguradora Beta', aseguradoraActual: false }), 'Aseguradora Alfa', 'lo declarado vale sin la marca')
})

test('compañía anterior: respaldo en aseguradora SOLO si es la de hoy', () => {
  assert.equal(companiaAnteriorDe({ historialDeclarado: { companiaActual: null }, aseguradora: 'Aseguradora Beta', aseguradoraActual: true }), 'Aseguradora Beta')
  assert.equal(companiaAnteriorDe({ aseguradora: 'Aseguradora Beta', aseguradoraActual: true }), 'Aseguradora Beta')
  assert.equal(companiaAnteriorDe({ aseguradora: 'Aseguradora Beta', aseguradoraActual: false }), null, 'la de nuestra oferta no cuenta')
  assert.equal(companiaAnteriorDe({ aseguradora: 'Aseguradora Beta', aseguradoraActual: null }), null)
})

test('compañía anterior: sin dato, cajón o código sin resolver → null; un cajón arriba deja paso al respaldo', () => {
  assert.equal(companiaAnteriorDe({}), null)
  assert.equal(companiaAnteriorDe({ historialDeclarado: null, aseguradora: null, aseguradoraActual: true }), null)
  for (const v of ['otro', 'Otro', 'N/A', '', '   ', 'C0058', 'x'.repeat(81)]) {
    assert.equal(companiaAnteriorDe({ historialDeclarado: { companiaActual: v }, aseguradora: v, aseguradoraActual: true }), null, v)
  }
  assert.equal(companiaAnteriorDe({ historialDeclarado: { companiaActual: 'N/A' }, aseguradora: 'Aseguradora Beta', aseguradoraActual: true }), 'Aseguradora Beta')
  assert.equal(companiaLimpia(7), null)
})

test('compañía anterior: sin seguro declarado (false o 0 años) no hay anterior', () => {
  assert.equal(companiaAnteriorDe({ historialDeclarado: { companiaActual: 'Aseguradora Alfa', tieneSeguroActual: false } }), null)
  assert.equal(companiaAnteriorDe({ historialDeclarado: { aniosAsegurado: 0 }, aseguradora: 'Aseguradora Beta', aseguradoraActual: true }), null)
  assert.equal(companiaAnteriorDe({ historialDeclarado: { aniosAsegurado: 4, tieneSeguroActual: true, companiaActual: 'Aseguradora Alfa' } }), 'Aseguradora Alfa')
})
