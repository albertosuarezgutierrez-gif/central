import { test } from 'node:test'
import assert from 'node:assert/strict'
import { conPiso, etiquetaPlanta, TIENE_NUMERO } from './piso-catastro.ts'

test('la planta del Catastro se dice como la diría una persona', () => {
  assert.equal(etiquetaPlanta('00'), 'Bajo')
  assert.equal(etiquetaPlanta('02'), '2º')
  assert.equal(etiquetaPlanta('-1'), 'Sótano 1')
  assert.equal(etiquetaPlanta('OD'), 'Pl. OD')
  assert.equal(etiquetaPlanta(null), 'Pl. ?')
})

test('el piso elegido sustituye al tecleado, y se queda la calle y el número', () => {
  assert.equal(conPiso('Calle San Vicente 40', '02', '11'), 'Calle San Vicente 40, 2º 11')
  assert.equal(conPiso('Calle San Vicente 40, 3º B', '02', '11'), 'Calle San Vicente 40, 2º 11')
  assert.equal(conPiso('C/ Sierpes, 12', '00', 'A'), 'C/ Sierpes, 12, Bajo A')
  assert.equal(conPiso('Calle Socorro 24', null, null), 'Calle Socorro 24')
  // Una calle con número en el nombre no se corta en el primero.
  assert.equal(conPiso('Calle 28 de Febrero 5', '01', 'B'), 'Calle 28 de Febrero 5, 1º B')
  assert.equal(conPiso('Calle San Vicente 40 3º B', '02', '11'), 'Calle San Vicente 40, 2º 11')
})

test('sin número no se ofrece consultar el Catastro', () => {
  assert.equal(TIENE_NUMERO.test('Calle San Vicente'), false)
  assert.equal(TIENE_NUMERO.test('Calle San Vicente 40'), true)
})
