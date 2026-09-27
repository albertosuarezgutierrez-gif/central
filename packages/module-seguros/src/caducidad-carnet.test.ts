import test from 'node:test'
import assert from 'node:assert/strict'
import { caducidadCarnet } from './caducidad-carnet.ts'

test('coche/moto (B) antes de los 65: 10 años', () => {
  const r = caducidadCarnet({ fechaCarnet: '2020-03-15', fechaNacimiento: '1980-01-01', tipo: 'B' })
  assert.deepEqual(r, { fechaCaducidad: '2030-03-15', plazoAnios: 10, esTramoMayor: false })
})

test('coche/moto (B) con 65 exactos en la renovación: 5 años, no 10', () => {
  // Nace el 2020-03-15, cumple 65 ese mismo día: ya está en el tramo mayor.
  const r = caducidadCarnet({ fechaCarnet: '2020-03-15', fechaNacimiento: '1955-03-15', tipo: 'B' })
  assert.deepEqual(r, { fechaCaducidad: '2025-03-15', plazoAnios: 5, esTramoMayor: true })
})

test('un día antes de cumplir 65 todavía es tramo de 10 años', () => {
  const r = caducidadCarnet({ fechaCarnet: '2020-03-14', fechaNacimiento: '1955-03-15', tipo: 'B' })
  assert.deepEqual(r, { fechaCaducidad: '2030-03-14', plazoAnios: 10, esTramoMayor: false })
})

test('permiso profesional (C) antes de los 65: 5 años', () => {
  const r = caducidadCarnet({ fechaCarnet: '2022-06-01', fechaNacimiento: '1990-01-01', tipo: 'C' })
  assert.deepEqual(r, { fechaCaducidad: '2027-06-01', plazoAnios: 5, esTramoMayor: false })
})

test('permiso profesional (D1E) con 65+ años: 3 años', () => {
  const r = caducidadCarnet({ fechaCarnet: '2022-06-01', fechaNacimiento: '1950-01-01', tipo: 'D1E' })
  assert.deepEqual(r, { fechaCaducidad: '2025-06-01', plazoAnios: 3, esTramoMayor: true })
})

test('el tipo no distingue mayúsculas/minúsculas ni espacios', () => {
  const r = caducidadCarnet({ fechaCarnet: '2022-06-01', fechaNacimiento: '1990-01-01', tipo: ' c ' })
  assert.equal(r?.plazoAnios, 5)
})

test('tipo desconocido cae al tramo ligero (coche/moto)', () => {
  const r = caducidadCarnet({ fechaCarnet: '2022-06-01', fechaNacimiento: '1990-01-01', tipo: 'AM' })
  assert.equal(r?.plazoAnios, 10)
})

test('sin fecha de nacimiento no se calcula nada: null, no se adivina', () => {
  assert.equal(caducidadCarnet({ fechaCarnet: '2022-06-01', fechaNacimiento: null, tipo: 'B' }), null)
})

test('sin fecha de carné no se calcula nada', () => {
  assert.equal(caducidadCarnet({ fechaCarnet: undefined, fechaNacimiento: '1990-01-01', tipo: 'B' }), null)
})

test('una fecha que Date desliza (31 de febrero) se trata como ausente', () => {
  assert.equal(caducidadCarnet({ fechaCarnet: '2022-02-31', fechaNacimiento: '1990-01-01', tipo: 'B' }), null)
})
