import test from 'node:test'
import assert from 'node:assert/strict'
import { componerDireccion, componerExtranjera, valorAEmitir } from './direccion-texto.ts'

const ok = { calle: 'CL PARRA LA', numero: '12', cp: '41003', municipio: 'Sevilla', provincia: 'Sevilla' }

test('compone «Calle Nº, CP Municipio (Provincia)»', () => {
  assert.equal(componerDireccion(ok), 'CL PARRA LA 12, 41003 Sevilla (Sevilla)')
  assert.equal(componerDireccion({ ...ok, calle: '  CL  PARRA ', numero: ' s/n ' }), 'CL PARRA s/n, 41003 Sevilla (Sevilla)')
})
test('si falta cualquier parte devuelve vacío (nunca a medias)', () => {
  for (const k of ['calle', 'numero', 'municipio', 'provincia'] as const) assert.equal(componerDireccion({ ...ok, [k]: ' ' }), '')
  assert.equal(componerDireccion({ ...ok, cp: '4100' }), '')
  assert.equal(componerDireccion({ ...ok, cp: '41O03' }), '')
})

test('dirección extranjera: texto + país, incompleta = vacío', () => {
  assert.equal(componerExtranjera({ pais: ' Portugal ', texto: 'Rua Augusta 10, 1100 Lisboa' }), 'Rua Augusta 10, 1100 Lisboa, Portugal')
  assert.equal(componerExtranjera({ pais: '', texto: 'Rua Augusta 10' }), '')
  assert.equal(componerExtranjera({ pais: 'Francia', texto: ' ' }), '')
})
test('nunca se emite vacío encima de un valor previo', () => {
  assert.equal(valorAEmitir('', 'CL X 1, 41003 Sevilla (Sevilla)'), 'CL X 1, 41003 Sevilla (Sevilla)')
  assert.equal(valorAEmitir('CL Y 2, 41003 Sevilla (Sevilla)', 'viejo'), 'CL Y 2, 41003 Sevilla (Sevilla)')
  assert.equal(valorAEmitir('', ''), '')
})
