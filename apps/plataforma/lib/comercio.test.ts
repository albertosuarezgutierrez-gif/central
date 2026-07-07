import { test } from 'node:test'
import assert from 'node:assert/strict'
import { comercioDe, SIN_IDENTIFICAR } from './comercio.ts'

test('quita el prefijo de operación y deja el comercio', () => {
  assert.equal(comercioDe('COMPRA EN DIA SEVILLA 2260', 'COMPRA EN DIA SEVILLA 2260'), 'DIA SEVILLA 2260')
  assert.equal(comercioDe('COMPRA EN HORNO NUEVA FLORIDA', null), 'HORNO NUEVA FLORIDA')
  assert.equal(comercioDe(null, 'PAGO DE LUZ IBERDROLA'), 'LUZ IBERDROLA')
})

test('MISMO comercio con y sin contraparte cae en el mismo grupo', () => {
  const conCp = comercioDe('COMPRA EN DIA SEVILLA 2260', 'COMPRA EN DIA SEVILLA 2260')
  const sinCp = comercioDe(null, 'COMPRA EN DIA SEVILLA 2260')
  assert.equal(conCp, sinCp)
  assert.equal(conCp, 'DIA SEVILLA 2260')
})

test('contraparte ya limpia se respeta', () => {
  assert.equal(comercioDe('MERCADONA S.A.', null), 'MERCADONA S.A.')
  assert.equal(comercioDe('  LIDL SEVILLA  ', 'x'), 'LIDL SEVILLA')
})

test('no se come palabras que empiezan como el verbo (COMPRAVENTA)', () => {
  assert.equal(comercioDe('COMPRAVENTA GARCIA', null), 'COMPRAVENTA GARCIA')
})

test('irreconocible → Sin identificar', () => {
  assert.equal(comercioDe(null, null), SIN_IDENTIFICAR)
  assert.equal(comercioDe('', ''), SIN_IDENTIFICAR)
  assert.equal(comercioDe(null, 'COMPRA EN'), SIN_IDENTIFICAR)
})

test('dos comercios distintos NO colapsan', () => {
  assert.notEqual(comercioDe(null, 'COMPRA EN OSORNITO'), comercioDe(null, 'COMPRA EN BAZAR YIN YIN'))
})
