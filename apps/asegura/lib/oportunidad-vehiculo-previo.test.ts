import { test } from 'node:test'
import assert from 'node:assert/strict'
import { puedeEscribirDatosVehiculo as puede } from './oportunidad-vehiculo-previo.ts'

test('puedeEscribirDatosVehiculo: sin datos leídos no escribe', () => {
  assert.equal(puede({ matricula: null, vehiculo: null }, null), false)
})
test('sin coche antiguo escribe', () => {
  assert.equal(puede({ matricula: null, vehiculo: null }, { matricula: '1234BCD' }), true)
  assert.equal(puede({ matricula: null, vehiculo: '  ' }, { matricula: null }), true)
})
test('matrícula antigua igual (normalizada) escribe; distinta o sin matrícula leída, no', () => {
  assert.equal(puede({ matricula: '1234 bcd', vehiculo: 'SEAT Ibiza' }, { matricula: '1234-BCD' }), true)
  assert.equal(puede({ matricula: '1234BCD', vehiculo: null }, { matricula: '5678FGH' }), false)
  assert.equal(puede({ matricula: '1234BCD', vehiculo: null }, { matricula: null }), false)
})
test('solo vehiculo texto: no escribe', () => {
  assert.equal(puede({ matricula: null, vehiculo: 'SEAT Ibiza 1.0' }, { matricula: '1234BCD' }), false)
})
