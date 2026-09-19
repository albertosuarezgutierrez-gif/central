import test from 'node:test'
import assert from 'node:assert/strict'
import { admiteDireccionRiesgo, validarDireccionRiesgo } from './direccion-riesgo.ts'

test('acepta una dirección completa y normaliza espacios', () => {
  const v = validarDireccionRiesgo({ direccion: '  Calle   Socorro 24, 3º B ', cp: ' 41003 ', localidad: ' Sevilla ' })
  assert.deepEqual(v, { ok: true, valor: { direccion: 'Calle Socorro 24, 3º B', cp: '41003', localidad: 'Sevilla' } })
})

test('cp y localidad vacíos salen como null, nunca como cadena vacía', () => {
  const v = validarDireccionRiesgo({ direccion: 'Avenida de la Constitución 1', cp: '', localidad: '   ' })
  assert.ok(v.ok)
  assert.equal(v.valor.cp, null)
  assert.equal(v.valor.localidad, null)
})

test('sin dirección no hay nada que guardar', () => {
  assert.equal(validarDireccionRiesgo({ direccion: '' }).ok, false)
  assert.equal(validarDireccionRiesgo({}).ok, false)
  assert.equal(validarDireccionRiesgo({ direccion: 42 }).ok, false)
})

test('un hueco con forma de dato («C/», «-») se rechaza', () => {
  assert.equal(validarDireccionRiesgo({ direccion: 'C/' }).ok, false)
  assert.equal(validarDireccionRiesgo({ direccion: '-----' }).ok, false)
  assert.equal(validarDireccionRiesgo({ direccion: '12345' }).ok, false)
})

test('el código postal son 5 cifras: un cero perdido se rechaza en la puerta', () => {
  assert.equal(validarDireccionRiesgo({ direccion: 'Calle Betis 10', cp: '4100' }).ok, false)
  assert.equal(validarDireccionRiesgo({ direccion: 'Calle Betis 10', cp: '41010A' }).ok, false)
  assert.equal(validarDireccionRiesgo({ direccion: 'Calle Betis 10', cp: '41010' }).ok, true)
})

test('topes de longitud', () => {
  assert.equal(validarDireccionRiesgo({ direccion: 'a'.repeat(201) }).ok, false)
  assert.equal(validarDireccionRiesgo({ direccion: 'Calle Betis 10', localidad: 'x'.repeat(81) }).ok, false)
})

test('solo los ramos de inmueble admiten dirección de riesgo', () => {
  assert.equal(admiteDireccionRiesgo('hogar'), true)
  assert.equal(admiteDireccionRiesgo(' Comunidades '), true)
  // comercio se describe por actividad: la ficha no pintaría la calle
  assert.equal(admiteDireccionRiesgo('comercio'), false)
  assert.equal(admiteDireccionRiesgo('auto'), false)
  assert.equal(admiteDireccionRiesgo('vida'), false)
  assert.equal(admiteDireccionRiesgo(null), false)
})
