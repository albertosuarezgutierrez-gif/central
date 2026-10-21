import test from 'node:test'
import assert from 'node:assert/strict'
import { clavesMunicipio, elegirMunicipioCatalogo } from './municipio-catalogo.ts'

const CAT = [{ id: '101', nombre: 'Castillo de Locubín' }, { id: '102', nombre: 'Alcalá la Real' }]

test('casa sin tildes, mayúsculas ni puntuación: «CASTILLO DE LOCUBIN»', () => {
  assert.equal(elegirMunicipioCatalogo(CAT, { guardado: 'CASTILLO DE LOCUBIN' })?.id, '101')
  assert.equal(elegirMunicipioCatalogo(CAT, { ine: ['castillo de locubín '] })?.id, '101')
})
test('artículos: «Puerto de Santa María, El» = «El Puerto de Santa María»', () => {
  const cat = [{ id: '1', nombre: 'Puerto de Santa María, El' }, { id: '2', nombre: 'Cádiz' }]
  assert.equal(elegirMunicipioCatalogo(cat, { ine: ['El Puerto de Santa María'] })?.id, '1')
  assert.equal(elegirMunicipioCatalogo(cat, { guardado: 'Puerto de Santa Maria' })?.id, '1')
})
test('bilingüe «Alicante/Alacant» casa con cualquiera de las dos', () => {
  assert.deepEqual(clavesMunicipio('Alicante/Alacant').sort(), ['alacant', 'alicante'])
  assert.equal(elegirMunicipioCatalogo([{ id: '9', nombre: 'Alicante/Alacant' }], { ine: ['Alicante'] })?.id, '9')
})
test('sin coincidencia exacta o ambigua → null (no se adivina por parecido)', () => {
  assert.equal(elegirMunicipioCatalogo(CAT, { guardado: 'Castillo', ine: ['Castillo'] })?.id, undefined)
  assert.equal(elegirMunicipioCatalogo(CAT, { guardado: '', ine: [] }), null)
  assert.equal(elegirMunicipioCatalogo([{ id: '1', nombre: 'Villanueva' }, { id: '2', nombre: 'La Villanueva' }], { guardado: 'Villanueva' }), null)
})
test('CP con varios municipios INE: no se preselecciona aunque el catálogo traiga solo uno de ellos', () => {
  assert.equal(elegirMunicipioCatalogo(CAT, { ine: ['Castillo de Locubín', 'Otro pueblo'] }), null)
  assert.equal(elegirMunicipioCatalogo(CAT, { ine: null }), null)
})
test('CP nuevo: sin `guardado` el nombre anterior no cuenta; con `guardado` (CP igual) sí', () => {
  assert.equal(elegirMunicipioCatalogo(CAT, { ine: ['Alcalá la Real'] })?.id, '102')
  assert.equal(elegirMunicipioCatalogo(CAT, { guardado: null, ine: ['Pueblo inexistente'] }), null)
  assert.equal(elegirMunicipioCatalogo(CAT, { guardado: 'Alcalá la Real', ine: ['A', 'B'] })?.id, '102')
})
