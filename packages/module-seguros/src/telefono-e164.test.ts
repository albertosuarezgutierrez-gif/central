import test from 'node:test'
import assert from 'node:assert/strict'
import { aE164, esTelefonoValido, variantesIndiceTelefono } from './telefono-e164.ts'

test('las formas habituales del mismo móvil español dan el MISMO E.164', () => {
  for (const r of ['600 11 22 33', '+34 600112233', '0034600112233', '34600112233', '(+34) 600-11-22-33']) {
    assert.equal(aE164(r), '+34600112233', r)
  }
  assert.equal(aE164('954 123 456'), '+34954123456')
})

test('un número extranjero con prefijo conserva su país', () => {
  assert.equal(aE164('+44 7911 123456'), '+447911123456')
})

test('«no consta» y «no es un teléfono» dan null: nunca se inventa un número', () => {
  for (const r of [null, undefined, '', '   ', 'abc', '612', '6001122334455']) {
    assert.equal(aE164(r as string | null), null, String(r))
  }
  assert.equal(esTelefonoValido('612'), false)
})

test('🪤 un valor cifrado que no se abrió NO se convierte en teléfono', () => {
  assert.equal(aE164('v1:abc:def:ghi'), null)
  assert.deepEqual(variantesIndiceTelefono('v1:12:34:56'), [])
})

test('variantes del índice ciego: con prefijo, nacional y 00', () => {
  const v = variantesIndiceTelefono('+34 600 11 22 33')
  assert.ok(v.includes('34600112233'))
  assert.ok(v.includes('600112233'))
  assert.ok(v.includes('0034600112233'))
  assert.deepEqual(variantesIndiceTelefono(null), [])
})
