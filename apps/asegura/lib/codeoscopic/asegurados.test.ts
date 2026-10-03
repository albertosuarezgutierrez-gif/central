import { test } from 'node:test'
import assert from 'node:assert/strict'
import { construirAsegurado, leerAseguradosAdicionales, MAX_ADICIONALES_CORDURA, revisarAsegurado, revisarAseguradosAdicionales } from './asegurados.ts'

const OK = { nombre: ' Ana ', apellido1: 'Pérez', fechaNacimiento: '2012-05-01', sexo: 'mujer' as const }

test('leer: descarta lo que no es un objeto, recorta y deja vacío lo mal tipado (lo reclama revisar)', () => {
  assert.deepEqual(leerAseguradosAdicionales(undefined), [])
  assert.deepEqual(leerAseguradosAdicionales('x'), [])
  const l = leerAseguradosAdicionales([null, 7, 'x', [], { nombre: ' Ana ', apellido1: 'P', fechaNacimiento: 5, sexo: 'otro', dni: '  ' }])
  assert.equal(l.length, 1)
  assert.equal(l[0].nombre, 'Ana')
  assert.equal(l[0].fechaNacimiento, '')
  assert.ok(revisarAsegurado(l[0]).some((r) => r.campo === 'sexo'))
  assert.equal(l[0].dni, null)
})

test('leer: tope de cordura contra un cuerpo absurdo', () => {
  const muchos = Array.from({ length: 500 }, () => OK)
  assert.equal(leerAseguradosAdicionales(muchos).length, MAX_ADICIONALES_CORDURA)
})

test('revisar: nombre, primer apellido, nacimiento aaaa-mm-dd y sexo son obligatorios; el DNI no', () => {
  assert.deepEqual(revisarAsegurado(OK), [])
  assert.equal(revisarAsegurado({}).length, 4)
  assert.ok(revisarAsegurado({ ...OK, fechaNacimiento: '01/05/2012' }).some((r) => r.campo === 'fechaNacimiento'))
})

test('revisar: DNI con letra mala, o NIE sin nacionalidad, se rechaza; DNI bueno exige segundo apellido', () => {
  assert.ok(revisarAsegurado({ ...OK, dni: '12345678A', apellido2: 'S' }).some((r) => r.campo === 'dni'))
  assert.ok(revisarAsegurado({ ...OK, dni: '00000000T' }).some((r) => r.campo === 'apellido2'))
  assert.ok(revisarAsegurado({ ...OK, dni: 'X0000000T' }).some((r) => r.campo === 'nacionalidad'))
  assert.deepEqual(revisarAsegurado({ ...OK, dni: '00000000T', apellido2: 'S' }), [])
})

test('construir: NaturalPerson mínima, sin teléfono ni estado civil; con NIE lleva nationality.code', () => {
  assert.deepEqual(construirAsegurado(OK), { name: 'Ana', surname: 'Pérez', birthDate: '2012-05-01', gender: { id: 'Female' } })
  const nie = construirAsegurado({ ...OK, dni: 'X0000000T', nacionalidad: 'mar' })
  assert.deepEqual(nie.nationality, { code: 'MAR' })
  assert.deepEqual(nie.identificationDocument, { type: { id: 'Nie' }, id: 'X0000000T' })
  assert.throws(() => construirAsegurado({ ...OK, nombre: '' }), /codeoscopic_datos_incompletos/)
})

test('revisarAseguradosAdicionales numera a cada asegurado y no dice nada si todo está bien', () => {
  assert.deepEqual(revisarAseguradosAdicionales([OK, OK]), [])
  const m = revisarAseguradosAdicionales([OK, { ...OK, apellido1: '' }])
  assert.equal(m.length, 1)
  assert.match(m[0], /^asegurado adicional 2:/)
})
