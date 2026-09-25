import { test } from 'node:test'
import assert from 'node:assert/strict'
import { compararConCima, huellaDecisionCima, fechaCima, type FichaParaCima, type DatosCima } from './sincro-cima.ts'

const vacia: FichaParaCima = { nombre: 'Pablo Guzman Lozano', fechaNacimiento: null, fechaNacimientoIlegible: false, carnets: [], telefonos: [], emails: [] }
const cima: DatosCima = { nombre: 'PABLO GUZMÁN LOZANO', fechaNacimiento: '1980-03-04', fechaCarnet: '1999-01-02', telefonos: ['+34 600 11 22 33'], emails: ['Pablo@Ej.es'] }

test('ficha vacía → todo se RELLENA; el nombre igual (tildes/mayúsculas) no es diferencia', () => {
  const d = compararConCima(vacia, cima)
  assert.deepEqual(d.map((x) => `${x.campo}:${x.accion}`), ['fechaNacimiento:rellenar', 'fechaCarnet:rellenar', 'telefono:rellenar', 'email:rellenar'])
})

test('datos distintos → DISCREPA con los dos valores; los iguales no salen', () => {
  const f: FichaParaCima = { nombre: 'Juan Perez', fechaNacimiento: '1980-03-04', fechaNacimientoIlegible: false, carnets: ['2001-05-05'], telefonos: ['611223344', '600112233'], emails: ['otro@ej.es'] }
  const d = compararConCima(f, cima)
  assert.deepEqual(d.map((x) => `${x.campo}:${x.accion}`), ['nombre:discrepa', 'fechaCarnet:discrepa', 'email:discrepa'])
  assert.equal(d[0].ficha, 'Juan Perez')
  assert.equal(d[2].cima, 'Pablo@Ej.es')
})

test('lo ilegible o no leído NO es un hueco: nunca se rellena encima', () => {
  const f: FichaParaCima = { nombre: null, fechaNacimiento: null, fechaNacimientoIlegible: true, carnets: [null], telefonos: null, emails: null }
  const d = compararConCima(f, cima)
  assert.deepEqual(d.map((x) => x.campo), ['nombre'])
})

test('CIMA sin datos → nada que hacer', () => {
  assert.deepEqual(compararConCima(vacia, { nombre: null, fechaNacimiento: null, fechaCarnet: null, telefonos: [], emails: [] }), [])
})

test('el orden de palabras del nombre no es una discrepancia', () => {
  assert.deepEqual(compararConCima({ ...vacia, nombre: 'Guzman Lozano, Pablo' }, { ...cima, fechaNacimiento: null, fechaCarnet: null, telefonos: [], emails: [] }), [])
})

test('huella: el mismo teléfono escrito distinto da la misma huella; otro valor, otra', () => {
  assert.equal(huellaDecisionCima('telefono', '+34 600 11 22 33'), huellaDecisionCima('telefono', '600112233'))
  assert.notEqual(huellaDecisionCima('telefono', '600112233'), huellaDecisionCima('telefono', '600112234'))
  assert.equal(fechaCima('04/03/1980'), '1980-03-04')
})

test('una fecha de nacimiento guardada en formato raro NO es un hueco: discrepa, no se pisa sola', () => {
  const d = compararConCima({ ...vacia, fechaNacimiento: '1980/03/04' }, { ...cima, fechaCarnet: null, telefonos: [], emails: [] })
  assert.deepEqual(d.map((x) => `${x.campo}:${x.accion}:${x.ficha}`), ['fechaNacimiento:discrepa:1980/03/04'])
})
