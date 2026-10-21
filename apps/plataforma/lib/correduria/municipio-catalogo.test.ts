import test from 'node:test'
import assert from 'node:assert/strict'
import { clavesMunicipio, elegirMunicipioCatalogo } from './municipio-catalogo.ts'

const CAT = [{ id: '101', nombre: 'Castillo de Locubín' }, { id: '102', nombre: 'Alcalá la Real' }]

test('casa sin tildes, mayúsculas ni puntuación: «CASTILLO DE LOCUBIN»', () => {
  assert.equal(elegirMunicipioCatalogo(CAT, ['CASTILLO DE LOCUBIN'])?.id, '101')
  assert.equal(elegirMunicipioCatalogo(CAT, ['castillo de locubín '])?.id, '101')
})
test('artículos: «Puerto de Santa María, El» = «El Puerto de Santa María»', () => {
  const cat = [{ id: '1', nombre: 'Puerto de Santa María, El' }, { id: '2', nombre: 'Cádiz' }]
  assert.equal(elegirMunicipioCatalogo(cat, ['El Puerto de Santa María'])?.id, '1')
  assert.equal(elegirMunicipioCatalogo(cat, ['Puerto de Santa Maria'])?.id, '1')
})
test('bilingüe «Alicante/Alacant» casa con cualquiera de las dos', () => {
  assert.deepEqual(clavesMunicipio('Alicante/Alacant').sort(), ['alacant', 'alicante'])
  assert.equal(elegirMunicipioCatalogo([{ id: '9', nombre: 'Alicante/Alacant' }], ['Alicante'])?.id, '9')
})
test('sin coincidencia exacta o ambigua → null (no se adivina por parecido)', () => {
  assert.equal(elegirMunicipioCatalogo(CAT, ['Castillo'])?.id, undefined)
  assert.equal(elegirMunicipioCatalogo(CAT, [null, '', undefined]), null)
  assert.equal(elegirMunicipioCatalogo([{ id: '1', nombre: 'Villanueva' }, { id: '2', nombre: 'La Villanueva' }], ['Villanueva']), null)
})
test('varios nombres conocidos (ficha + INE): vale el que casa', () => {
  assert.equal(elegirMunicipioCatalogo(CAT, ['', 'Alcalá la Real'])?.id, '102')
})
