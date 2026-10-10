import { test } from 'node:test'
import assert from 'node:assert/strict'
import { cifValido, construirEmpresa, documentoDe, esEmpresa } from './persona.ts'

// CIF inventados con su control calculado a mano: B1234567 → 4, Q1234567 → D.
test('cifValido: control de dígito, control de letra y letras de organización', () => {
  assert.equal(cifValido('B12345674'), true)
  assert.equal(cifValido('b-1234567-4'), true, 'guiones, espacios y minúsculas no importan')
  assert.equal(cifValido('B12345675'), false, 'control mal')
  assert.equal(cifValido('Q1234567D'), true, 'Q exige letra')
  assert.equal(cifValido('Q12345674'), false, 'Q con dígito no vale')
  assert.equal(cifValido('B1234567D'), false, 'B exige dígito')
  assert.equal(cifValido('00000000T'), false, 'un DNI no es un CIF')
  assert.equal(cifValido('I12345674'), false, 'I no es letra de CIF')
})

test('construirEmpresa: la dirección solo viaja con CP y municipio, y un móvil raro no viaja', () => {
  const sin = construirEmpresa({ tipo: 'juridica', cif: 'B12345674', razonSocial: 'X SL', cpResidencia: '41003', telefono: '123' })
  assert.equal(sin.addresses, undefined)
  assert.equal(sin.phones, undefined)
  const con = construirEmpresa({ tipo: 'juridica', cif: 'B12345674', razonSocial: 'X SL', cpResidencia: '41003', municipioResidenciaId: 7, nombreVia: 'Sol', email: 'a@b.es' })
  assert.deepEqual(con.addresses, [{ postalCode: '41003', town: { id: 7 }, primary: true, roadName: 'Sol' }])
  assert.ok(Array.isArray(con.emails))
})

test('documentoDe y esEmpresa distinguen persona y empresa', () => {
  assert.equal(esEmpresa({ tipo: 'juridica' }), true)
  assert.equal(esEmpresa({ dni: 'x' }), false)
  assert.equal(documentoDe({ tipo: 'juridica', cif: 'b 1234567-4' }), 'B12345674')
  assert.equal(documentoDe({ dni: '00000000t' }), '00000000T')
})
