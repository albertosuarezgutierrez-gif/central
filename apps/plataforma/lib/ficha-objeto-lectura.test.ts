import { test } from 'node:test'
import assert from 'node:assert/strict'
import { leerObjeto, leerFichaObjeto, leerIntervinientes } from './ficha-asegura.ts'
import { interpretarObjeto } from './cartera-asegura.ts'

const FICHA = [{ etiqueta: 'Potencia', valor: '132' }, { etiqueta: 'Combustible', valor: 'GA' }]

test('leerFichaObjeto: solo pares etiqueta/valor con texto; forma rara o vacía → null', () => {
  assert.deepEqual(leerFichaObjeto([...FICHA, { etiqueta: 'x', valor: '  ' }, null, 3, { etiqueta: 'y' }]), FICHA)
  assert.equal(leerFichaObjeto(undefined), null)
  assert.equal(leerFichaObjeto('no'), null)
  assert.equal(leerFichaObjeto([]), null)
})

test('🚨 leerObjeto e interpretarObjeto conservan la ficha del bien (antes la descartaban)', () => {
  const crudo = { estado: 'conocido', titulo: 'SEAT IBIZA', detalle: '1234ABC', nota: null, coberturas: null, ficha: FICHA, bastidor: 'VSSZZZ6JZ9R000001' }
  assert.deepEqual(leerObjeto(crudo)?.ficha, FICHA)
  assert.deepEqual(interpretarObjeto(crudo)?.ficha, FICHA)
  // El bastidor es solo de la ficha de la póliza y no viaja por las listas.
  assert.equal(JSON.stringify(interpretarObjeto(crudo)).includes('VSSZZZ'), false)
  assert.equal(leerObjeto({ ...crudo, ficha: undefined })?.ficha ?? null, null)
})

test('leerIntervinientes: fechas de carné y nacimiento del conductor, null si no llegan', () => {
  const fila = { polizaId: 'p', rol: 'conductor_habitual', fechaCarnet: '2008-03-12', fechaNacimiento: '1980-05-03' }
  const [a, b] = leerIntervinientes([fila, { polizaId: 'p', rol: 'propietario' }])!
  assert.equal(a.fechaCarnet, '2008-03-12')
  assert.equal(a.fechaNacimiento, '1980-05-03')
  assert.equal(b.fechaCarnet, null)
})
