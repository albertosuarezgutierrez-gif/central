import test from 'node:test'
import assert from 'node:assert/strict'
import { buscarCandidatos } from './buscar-simbolo.ts'

const FILAS = [
  { simbolo: 'PYPL', nombre: 'PayPal Holdings, Inc.', mktCap: 8e10 },
  { simbolo: 'PY', nombre: 'Pampa Energia', mktCap: 1e10 },
  { simbolo: 'MU', nombre: 'MICRON TECHNOLOGY INC', mktCap: 9e11 },
  { simbolo: 'MSFT', nombre: 'MICROSOFT CORP', mktCap: 3e12 },
]

test('ticker exacto gana aunque haya nombres parecidos', () => {
  assert.deepEqual(buscarCandidatos('pypl', FILAS).map(c => c.simbolo), ['PYPL'])
})

test('por nombre: «paypal» resuelve a PYPL; «micro» sugiere varios ordenados por capitalización', () => {
  assert.deepEqual(buscarCandidatos('PayPal', FILAS).map(c => c.simbolo), ['PYPL'])
  assert.deepEqual(buscarCandidatos('micro', FILAS).map(c => c.simbolo), ['MSFT', 'MU'])
})

test('prefijo de ticker también sugiere; consultas cortas o sin match → []', () => {
  assert.deepEqual(buscarCandidatos('PY', FILAS).map(c => c.simbolo), ['PY'])   // exacto gana
  assert.deepEqual(buscarCandidatos('PYP', FILAS).map(c => c.simbolo), ['PYPL'])
  assert.deepEqual(buscarCandidatos('x', FILAS), [])
  assert.deepEqual(buscarCandidatos('zzz', FILAS), [])
})
