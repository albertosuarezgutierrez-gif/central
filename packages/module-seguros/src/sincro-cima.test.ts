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

// ─── Reglas del 26/09/2026 (Alberto, sobre el panel de diferencias) ──────────
const soloNombre = { ...cima, fechaNacimiento: null, fechaCarnet: null, telefonos: [], emails: [] }

test('teléfono distinto → se AÑADE (no pregunta); el que ya está en la ficha no sale', () => {
  const d = compararConCima({ ...vacia, telefonos: ['666252020'] }, { ...soloNombre, telefonos: ['954172716'] })
  assert.deepEqual(d.map((x) => `${x.campo}:${x.accion}:${x.cima}`), ['telefono:anadir:954172716'])
})

test('email distinto SIGUE preguntando: vincula el portal del cliente', () => {
  const d = compararConCima({ ...vacia, emails: ['alfredo.pont@phh.es'] }, { ...soloNombre, emails: ['apontdelgadodecos@gmail.com'] })
  assert.deepEqual(d.map((x) => `${x.campo}:${x.accion}`), ['email:discrepa'])
})

test('a CIMA le falta un nombre que la ficha tiene → no es diferencia (la ficha está más completa)', () => {
  assert.deepEqual(compararConCima({ ...vacia, nombre: 'Alfonso Carlos Moncosi Gomez' }, { ...soloNombre, nombre: 'ALFONSO MONCOSI GOMEZ' }), [])
  // Una sola palabra no basta para decir que es la misma persona.
  assert.deepEqual(compararConCima({ ...vacia, nombre: 'Alfonso Carlos Moncosi Gomez' }, { ...soloNombre, nombre: 'ALFONSO' }).map((x) => x.accion), ['discrepa'])
})

test('mismo nombre con la ficha en MAYÚSCULAS → formatear a «Nombre Propio»; una grafía elegida se respeta', () => {
  const d = compararConCima({ ...vacia, nombre: 'ALFREDO LUIS PONT DELGADO DE COS' }, { ...soloNombre, nombre: 'Alfredo Luis Pont Delgado de Cos' })
  assert.deepEqual(d.map((x) => `${x.accion}:${x.cima}`), ['formatear:Alfredo Luis Pont Delgado de Cos'])
  assert.deepEqual(compararConCima({ ...vacia, nombre: 'Ronald McDonald Pérez' }, { ...soloNombre, nombre: 'RONALD MCDONALD PEREZ' }), [])
})

test('nombre que CIMA rellena o que discrepa sale en «Nombre Propio», no en mayúsculas', () => {
  assert.equal(compararConCima({ ...vacia, nombre: null }, { ...soloNombre, nombre: 'JOSÉ MARÍA GARCÍA-LÓPEZ DE LA TORRE' })[0].cima, 'José María García-López de la Torre')
})

test('la fecha del carné que se va UN día no es diferencia; dos días sí', () => {
  const f = { ...vacia, carnets: ['1999-01-01'] }
  assert.deepEqual(compararConCima(f, { ...soloNombre, fechaCarnet: '1999-01-02' }), [])
  assert.deepEqual(compararConCima(f, { ...soloNombre, fechaCarnet: '1999-01-03' }).map((x) => `${x.campo}:${x.accion}`), ['fechaCarnet:discrepa'])
})
