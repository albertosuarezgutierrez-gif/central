import { test } from 'node:test'
import assert from 'node:assert/strict'
import { construirPersona, documentoEspanolInvalido, normalizarDocumento, revisarPersona, tipoDocumento } from './persona.ts'

const BASE = {
  nombre: 'Ana', apellido1: 'Ruiz', apellido2: 'Gil', fechaNacimiento: '1980-01-02',
  sexo: 'mujer' as const, estadoCivil: 'Married', telefono: '611223344',
}

test('normaliza el documento: mayúsculas, sin separadores y DNI de 7 cifras con cero inicial', () => {
  assert.equal(normalizarDocumento(' 1.234.567-l '), '01234567L')
  assert.equal(normalizarDocumento('12345678-z'), '12345678Z')
  assert.equal(normalizarDocumento('x-1234567-l'), 'X1234567L')
  assert.equal(normalizarDocumento('AB123456'), 'AB123456')
})

test('un DNI de 7 cifras es Dni, no Passport, y viaja normalizado', () => {
  assert.equal(tipoDocumento('1234567L'), 'Dni')
  assert.equal(tipoDocumento('X1234567L'), 'Nie')
  assert.equal(tipoDocumento('AB123456'), 'Passport')
  const p = construirPersona({ ...BASE, dni: '1234567-l' }) as any
  assert.deepEqual(p.identificationDocument, { type: { id: 'Dni' }, id: '01234567L' })
})

test('letra de control módulo 23 de DNI y NIE', () => {
  assert.equal(documentoEspanolInvalido('12345678Z'), false)
  assert.equal(documentoEspanolInvalido('1234567L'), false)
  assert.equal(documentoEspanolInvalido('X1234567L'), false)
  assert.equal(documentoEspanolInvalido('12345678A'), true)
  assert.equal(documentoEspanolInvalido('X1234567A'), true)
  assert.equal(documentoEspanolInvalido('12345678U'), true) // letra fuera del juego del vendor
  assert.equal(documentoEspanolInvalido('AB123456'), false) // pasaporte: no se juzga
})

test('revisarPersona: letra de control mala = dato inválido gratis, buena = sin reparo', () => {
  assert.deepEqual(revisarPersona({ ...BASE, dni: '12345678Z' }).filter((x) => x.campo === 'dni'), [])
  assert.deepEqual(revisarPersona({ ...BASE, dni: '1234567L' }).filter((x) => x.campo === 'dni'), [])
  assert.equal(revisarPersona({ ...BASE, dni: '12345678A' }).filter((x) => x.campo === 'dni').length, 1)
  assert.equal(revisarPersona({ ...BASE, dni: 'X1234567A', nacionalidad: 'MAR' }).filter((x) => x.campo === 'dni').length, 1)
})

test('nacionalidad: obligatoria con NIE/pasaporte y de 3 letras', () => {
  assert.equal(revisarPersona({ ...BASE, dni: 'X1234567L' }).some((x) => x.campo === 'nacionalidad'), true)
  assert.equal(revisarPersona({ ...BASE, dni: 'X1234567L', nacionalidad: 'MA' }).some((x) => x.campo === 'nacionalidad'), true)
  assert.equal(revisarPersona({ ...BASE, dni: 'X1234567L', nacionalidad: 'mar' }).some((x) => x.campo === 'nacionalidad'), false)
})
