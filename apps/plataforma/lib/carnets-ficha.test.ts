import test from 'node:test'
import assert from 'node:assert/strict'
import { estadoCaducidadCarnet, leerCarnets } from './ficha-asegura.ts'

test('bloque ausente o con forma rara → null (no «sin carné»)', () => {
  assert.equal(leerCarnets(undefined), null)
  assert.equal(leerCarnets({ tipo: 'B' }), null)
})

test('lista vacía → [] (se miró y no consta ninguno)', () => {
  assert.deepEqual(leerCarnets([]), [])
})

test('normaliza el tipo y conserva fecha ilegible sin inventarla', () => {
  assert.deepEqual(
    leerCarnets([
      { id: 'a', tipo: ' a ', fechaExpedicion: '2005-06-01', fechaIlegible: false, fechaCaducidad: '2035-06-01' },
      { id: 'b', tipo: 'B', fechaExpedicion: null, fechaIlegible: true, fechaCaducidad: null },
      { id: 'x', tipo: '' },
      'basura',
    ]),
    [
      { id: 'a', tipo: 'A', fechaExpedicion: '2005-06-01', fechaIlegible: false, fechaCaducidad: '2035-06-01' },
      { id: 'b', tipo: 'B', fechaExpedicion: null, fechaIlegible: true, fechaCaducidad: null },
    ],
  )
})

test('caducidad frente a hoy: sin renovación registrada (NO «caducado») · pronto (≤90 días) · vigente · desconocido', () => {
  const hoy = '2026-09-23'
  assert.equal(estadoCaducidadCarnet('2026-09-22', hoy), 'sin_renovacion')
  assert.equal(estadoCaducidadCarnet('2026-12-22', hoy), 'pronto')
  assert.equal(estadoCaducidadCarnet('2026-12-23', hoy), 'vigente')
  assert.equal(estadoCaducidadCarnet(null, hoy), 'desconocido')
})
