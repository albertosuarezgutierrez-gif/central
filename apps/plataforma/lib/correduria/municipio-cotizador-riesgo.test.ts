import { test } from 'node:test'
import assert from 'node:assert/strict'
import { municipioAGuardar, municipioPrecargado, poblacionParaBot } from './municipio-cotizador-riesgo.ts'

// Datos SINTÉTICOS: CP y municipios inventados.
const LISTA = [{ id: '11', nombre: 'MUNICIPIO A' }, { id: '12', nombre: 'MUNICIPIO B' }]
const CP = '00001'
const guardado = { municipioCirculacionId: 12, municipioCirculacion: 'MUNICIPIO B', municipioCirculacionCp: CP, cpCirculacion: null }

test('precarga: el municipio guardado en el riesgo vuelve si el CP sigue siendo el mismo', () => {
  assert.equal(municipioPrecargado({ guardado, municipios: LISTA, cpMunicipios: CP }), '12')
  assert.equal(municipioPrecargado({ guardado: { ...guardado, cpCirculacion: CP }, municipios: LISTA, cpMunicipios: CP }), '12')
})

test('precarga: CP distinto (ficha o riesgo), sin ancla, sin CP, id que ya no está o un solo municipio → no se aplica', () => {
  assert.equal(municipioPrecargado({ guardado, municipios: LISTA, cpMunicipios: '00002' }), null, 'la ficha cambió de CP')
  assert.equal(municipioPrecargado({ guardado: { ...guardado, cpCirculacion: '00002' }, municipios: LISTA, cpMunicipios: CP }), null, 'el riesgo declara otro CP')
  assert.equal(municipioPrecargado({ guardado: { ...guardado, municipioCirculacionCp: null }, municipios: LISTA, cpMunicipios: CP }), null, 'guardado sin ancla')
  assert.equal(municipioPrecargado({ guardado, municipios: LISTA, cpMunicipios: null }), null, 'CP no se sabe')
  assert.equal(municipioPrecargado({ guardado: { ...guardado, municipioCirculacionId: 99 }, municipios: LISTA, cpMunicipios: CP }), null)
  assert.equal(municipioPrecargado({ guardado, municipios: [LISTA[1]], cpMunicipios: CP }), null, 'uno solo viene puesto solo')
  assert.equal(municipioPrecargado({ guardado: null, municipios: LISTA, cpMunicipios: CP }), null)
})

test('guardado: id, nombre y CP ancla en el riesgo; nada si no hay oportunidad, CP, varios municipios o ya estaba', () => {
  const e = { oportunidadId: 'op-1', elegidoId: '11', municipios: LISTA, cpMunicipios: CP, cpCirculacionRiesgo: null }
  assert.deepEqual(municipioAGuardar(e), { municipioCirculacionId: 11, municipioCirculacion: 'MUNICIPIO A', municipioCirculacionCp: CP })
  assert.equal(municipioAGuardar({ ...e, oportunidadId: null }), null)
  assert.equal(municipioAGuardar({ ...e, cpMunicipios: null }), null)
  assert.equal(municipioAGuardar({ ...e, cpCirculacionRiesgo: '00002' }), null, 'la lista no es la del CP del riesgo')
  assert.equal(municipioAGuardar({ ...e, municipios: [LISTA[0]] }), null)
  assert.equal(municipioAGuardar({ ...e, elegidoId: '' }), null)
  assert.equal(municipioAGuardar({ ...e, guardado: { ...guardado, municipioCirculacionId: 11 } }), null, 'ya guardado')
  assert.equal(municipioAGuardar({ ...e, municipios: [{ id: '11', nombre: 'Otro' }, LISTA[1]] }), null, 'nombre de cajón')
})

test('poblacion al bot: solo con 2+ municipios y el CP de la lista = el del riesgo; si no, no viaja (manda la ficha)', () => {
  const e = { elegidoId: '12', municipios: LISTA, cpMunicipios: CP, cpCirculacionRiesgo: null }
  assert.equal(poblacionParaBot(e), 'MUNICIPIO B')
  assert.equal(poblacionParaBot({ ...e, cpCirculacionRiesgo: CP }), 'MUNICIPIO B')
  assert.equal(poblacionParaBot({ ...e, cpCirculacionRiesgo: '00002' }), null, 'CP del riesgo distinto')
  assert.equal(poblacionParaBot({ ...e, cpMunicipios: null }), null)
  assert.equal(poblacionParaBot({ ...e, municipios: [LISTA[1]] }), null, 'un solo municipio: no se manda')
  assert.equal(poblacionParaBot({ ...e, elegidoId: '' }), null)
})
