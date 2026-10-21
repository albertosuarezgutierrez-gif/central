import { test } from 'node:test'
import assert from 'node:assert/strict'
import { municipioEquivalente, opcionesMunicipio, insertarVia, componerDireccion, localizacionValida } from './direccion-ui.ts'

test('opcionesMunicipio: lista conocida y valor dentro', () => {
  assert.deepEqual(opcionesMunicipio(['Sevilla', 'Dos Hermanas'], 'sevilla'), { opciones: ['Sevilla', 'Dos Hermanas'], legado: false, valor: 'Sevilla' })
})
test('opcionesMunicipio: dato antiguo fuera de lista se conserva como legado', () => {
  assert.deepEqual(opcionesMunicipio(['Sevilla'], 'Sevila'), { opciones: ['Sevila', 'Sevilla'], legado: true, valor: 'Sevila' })
})
test('opcionesMunicipio: CP desconocido (null) no inventa nada', () => {
  assert.deepEqual(opcionesMunicipio(null, ''), { opciones: [], legado: false, valor: '' })
})
test('insertarVia conserva el número', () => {
  assert.equal(insertarVia('parra 12', { tipo: 'CL', nombre: 'PARRA LA' }), 'CL PARRA LA 12')
  assert.equal(insertarVia('parra', { tipo: 'CL', nombre: 'PARRA LA' }), 'CL PARRA LA ')
})
test('componerDireccion', () => {
  assert.equal(componerDireccion({ calle: 'CL Parra 12', cp: '41003', municipio: 'Sevilla', provincia: 'Sevilla' }), 'CL Parra 12, 41003 Sevilla')
  assert.equal(componerDireccion({ calle: 'CL X 1', cp: '41700', municipio: 'Dos Hermanas', provincia: 'Sevilla' }), 'CL X 1, 41700 Dos Hermanas (Sevilla)')
  assert.equal(componerDireccion({ calle: '', cp: '', municipio: '', provincia: '' }), '')
})
test('localizacionValida', () => {
  assert.equal(localizacionValida({ cp: '41003', municipio: 'Sevilla', provincia: 'Sevilla' }), true)
  assert.equal(localizacionValida({ cp: '4100', municipio: 'Sevilla', provincia: 'Sevilla' }), false)
  assert.equal(localizacionValida({ cp: '41003', municipio: '', provincia: 'Sevilla' }), false)
})
test('municipio con otra grafía selecciona la opción oficial', () => {
  assert.equal(municipioEquivalente(['Málaga', 'Sevilla'], 'MALAGA'), 'Málaga')
  assert.deepEqual(opcionesMunicipio(['Málaga'], 'Malaga'), { opciones: ['Málaga'], legado: false, valor: 'Málaga' })
  assert.equal(municipioEquivalente(['Sevilla'], 'Utrera'), null)
  assert.equal(municipioEquivalente(null, 'Sevilla'), null)
})
