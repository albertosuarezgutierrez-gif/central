import test from 'node:test'
import assert from 'node:assert/strict'

import {
  normalizarTitular,
  fichaParaCotejar,
  etiquetaTitular,
  type TitularDeclarado,
} from './titular-declarado.ts'

test('🚨 «no se preguntó» NO es «es suya»', () => {
  // Todas las filas anteriores al 07/09/2026 tienen `titular_tipo` a null: nadie
  // les preguntó. Leerlo como `propio` convertiría un hueco en una afirmación
  // sobre de quién es una póliza — y de eso depende contra qué ficha se
  // comprueba si ya la lleva la casa.
  assert.equal(normalizarTitular({ tipo: null, nombre: null, cif: null }).tipo, 'sin_preguntar')
  assert.equal(normalizarTitular({ tipo: 'propio', nombre: null, cif: null }).tipo, 'propio')
})

test('🚨 «de mi empresa» SIN nombre no es una declaración de empresa', () => {
  // Es un hueco con forma de dato: aguas abajo se leería como «tiene empresa
  // identificada» y no lo está. Cae al estado que no afirma nada.
  assert.equal(normalizarTitular({ tipo: 'empresa', nombre: null, cif: null }).tipo, 'sin_preguntar')
  assert.equal(normalizarTitular({ tipo: 'empresa', nombre: '   ', cif: null }).tipo, 'sin_preguntar')
})

test('un tipo que no existe no se inventa', () => {
  assert.equal(normalizarTitular({ tipo: 'sociedad', nombre: 'X SL', cif: null }).tipo, 'sin_preguntar')
  assert.equal(normalizarTitular({ tipo: 42, nombre: null, cif: null }).tipo, 'sin_preguntar')
})

test('la empresa conserva nombre y CIF, recortados', () => {
  const t = normalizarTitular({ tipo: 'empresa', nombre: '  GLOBAL 2 SL  ', cif: ' b91234567 ' })
  assert.deepEqual(t, { tipo: 'empresa', nombre: 'GLOBAL 2 SL', cif: 'B91234567' })
})

test('el CIF puede faltar: mucha gente no se lo sabe', () => {
  const t = normalizarTitular({ tipo: 'empresa', nombre: 'GLOBAL 2 SL', cif: '  ' })
  assert.deepEqual(t, { tipo: 'empresa', nombre: 'GLOBAL 2 SL', cif: null })
})

test('🚨 lo declarado DE UNA EMPRESA no se coteja contra la ficha personal', () => {
  // Es el fallo concreto que esto arregla: si se comprueba «¿ya la llevo yo?»
  // contra la ficha personal de quien la sube, una póliza que su SOCIEDAD ya
  // tiene contratada contigo sale como oportunidad — y le ofreces a un cliente
  // lo que ya le vendiste.
  assert.equal(fichaParaCotejar({ tipo: 'empresa', nombre: 'GLOBAL 2 SL', cif: null }, 'c1'), null)
  assert.equal(fichaParaCotejar({ tipo: 'propio', nombre: null, cif: null }, 'c1'), 'c1')
})

test('🚨 sin preguntar tampoco se coteja', () => {
  // No se sabe de quién es. Cotejar contra la ficha personal sería suponer que
  // es suya, que es justo lo que no consta.
  assert.equal(fichaParaCotejar({ tipo: 'sin_preguntar', nombre: null, cif: null }, 'c1'), null)
})

test('las etiquetas distinguen los tres estados', () => {
  assert.match(etiquetaTitular({ tipo: 'empresa', nombre: 'GLOBAL 2 SL', cif: null }), /GLOBAL 2 SL/)
  assert.match(etiquetaTitular({ tipo: 'propio', nombre: null, cif: null }), /suya|él|ella|persona/i)
  assert.match(etiquetaTitular({ tipo: 'sin_preguntar', nombre: null, cif: null }), /no.*pregunt/i)
})
