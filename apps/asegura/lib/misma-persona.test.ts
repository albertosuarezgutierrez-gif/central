import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mismaPersonaPorNombre } from './misma-persona.ts'

test('mismo nombre y primer apellido, con o sin tildes: la misma persona', () => {
  assert.equal(mismaPersonaPorNombre({ nombre: 'José', apellidos: 'Suárez Salas' }, { nombre: 'JOSE', apellidos: 'SUAREZ SALAS' }), true)
  assert.equal(mismaPersonaPorNombre({ nombre: 'Jose', apellidos: 'Suarez' }, { nombre: 'Jose Manuel', apellidos: 'Suarez Salas' }), true)
})

test('otra persona con ese DNI (DNI mal tecleado): no se reutiliza', () => {
  assert.equal(mismaPersonaPorNombre({ nombre: 'Antonio', apellidos: 'Suárez' }, { nombre: 'María', apellidos: 'López García' }), false)
  assert.equal(mismaPersonaPorNombre({ nombre: 'Antonio', apellidos: 'Suárez' }, { nombre: 'Antonio', apellidos: 'López' }), false)
})

test('sin nombre o sin apellidos no se afirma que sea la misma', () => {
  assert.equal(mismaPersonaPorNombre({ nombre: 'Antonio' }, { nombre: 'Antonio', apellidos: 'Suárez' }), false)
  assert.equal(mismaPersonaPorNombre({ nombre: 'Antonio', apellidos: 'Suárez' }, { nombre: null, apellidos: null }), false)
})
