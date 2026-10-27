import { test } from 'node:test'
import assert from 'node:assert'
import { validarReceptor, lineasDireccion } from './receptor.ts'

const ES = {
  tipo: 'empresa', nombre: 'Acme Sevilla SL', nif: 'b-91000000', pais: 'ES', email: 'Admin@Acme.es',
  direccion: { cp: '41003', provincia: 'Sevilla', municipio: 'Sevilla', via: 'CL SOCORRO', numero: '24', resto: '1º A', viaCatastro: true },
}

function conCif(cif: string) { return { ...ES, nif: cif } }

test('NIF/NIE/CIF español válido con dígito de control', () => {
  for (const nif of ['28823484E', '12345678Z', 'X1234567L', 'A58818501']) {
    const r = validarReceptor({ ...ES, nif })
    assert.equal(r.ok, true, nif)
  }
})

test('NIF español inválido o VACÍO se rechaza (core-fiscal acepta vacío: aquí NO)', () => {
  for (const nif of ['', '28823484A', '1234567Z', 'X1234567A', 'A58818502', 'HOLA']) {
    const r = validarReceptor(conCif(nif))
    assert.equal(r.ok, false, nif)
    if (!r.ok) assert.ok(r.errores.nif, nif)
  }
})

test('España: CP, provincia, municipio, calle y número obligatorios', () => {
  const r = validarReceptor({ ...ES, nif: '28823484E', direccion: { cp: '4100', provincia: '', municipio: '', via: '', numero: '' } })
  assert.equal(r.ok, false)
  if (!r.ok) for (const k of ['direccion.cp', 'direccion.provincia', 'direccion.municipio', 'direccion.via', 'direccion.numero']) assert.ok(r.errores[k], k)
  assert.equal(validarReceptor({ ...ES, nif: '28823484E', direccion: { ...ES.direccion, cp: '99001' } }).ok, false)
  assert.equal(validarReceptor({ ...ES, nif: '28823484E', direccion: { ...ES.direccion, numero: 'S/N' } }).ok, true)
})

test('normaliza: NIF sin guiones en mayúsculas, email en minúsculas, controles fuera', () => {
  const r = validarReceptor({ ...ES, nif: '28823484-e', nombre: ' Acme\u0000  Sevilla SL ' })
  assert.equal(r.ok, true)
  if (r.ok) {
    assert.equal(r.receptor.nif, '28823484E')
    assert.equal(r.receptor.email, 'admin@acme.es')
    assert.equal(r.receptor.nombre, 'Acme Sevilla SL')
    assert.deepEqual(lineasDireccion(r.receptor), ['CL SOCORRO 24, 1º A', '41003 Sevilla (Sevilla)', 'España'])
  }
})

test('extranjero: dirección libre + id fiscal con forma; país fuera de la lista no vale', () => {
  const ext = { tipo: 'particular', nombre: 'John Smith', nif: 'GB123456789', pais: 'GB', email: 'j@x.co.uk', direccion: { lineas: '10 Downing Street', ciudad: 'London', cp: 'SW1A 2AA' } }
  const r = validarReceptor(ext)
  assert.equal(r.ok, true)
  if (r.ok) assert.deepEqual(lineasDireccion(r.receptor), ['10 Downing Street', 'SW1A 2AA London', 'Reino Unido'])
  assert.equal(validarReceptor({ ...ext, pais: 'ZZ' }).ok, false)
  assert.equal(validarReceptor({ ...ext, nif: '<script>' }).ok, false)
  assert.equal(validarReceptor({ ...ext, direccion: { lineas: '', ciudad: '' } }).ok, false)
})

test('email y tipo obligatorios; basura no revienta', () => {
  assert.equal(validarReceptor({ ...ES, nif: '28823484E', email: 'no-es-email' }).ok, false)
  assert.equal(validarReceptor({ ...ES, nif: '28823484E', tipo: 'otro' }).ok, false)
  for (const x of [null, undefined, 42, 'texto', []]) assert.equal(validarReceptor(x).ok, false)
})
