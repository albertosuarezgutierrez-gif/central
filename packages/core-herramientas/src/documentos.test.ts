import { test } from 'node:test'
import assert from 'node:assert/strict'
import { cifValido, nifPersonaValido } from './documentos.ts'

test('CIF de G2 y Global2 válidos; un dígito cambiado no', () => {
  assert.equal(cifValido('B88936158'), 'B88936158')
  assert.equal(cifValido('b-05457247'), 'B05457247')
  assert.equal(cifValido('B88936157'), null)
  assert.equal(cifValido('28823484E'), null, 'un NIF de persona no es un CIF')
})

test('NIF/NIE de persona', () => {
  assert.equal(nifPersonaValido('28823484e'), '28823484E')
  assert.equal(nifPersonaValido('28823484A'), null)
  assert.equal(nifPersonaValido('X1234567L'), 'X1234567L')
})
