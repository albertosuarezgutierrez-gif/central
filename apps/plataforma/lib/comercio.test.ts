import { test } from 'node:test'
import assert from 'node:assert/strict'
import { comercioDe, SIN_IDENTIFICAR } from './comercio.ts'

test('contraparte manda cuando existe (trim)', () => {
  assert.equal(comercioDe('  MERCADONA SA  ', 'COMPRA'), 'MERCADONA SA')
  assert.equal(comercioDe('LIDL SEVILLA', null), 'LIDL SEVILLA')
})

test('sin contraparte → deriva el comercio del concepto', () => {
  assert.equal(comercioDe(null, 'COMPRA EN PETROPRIX GINES'), 'PETROPRIX')
  assert.equal(comercioDe('', 'COMPRA EN NETFLIX.COM'), 'NETFLIX')
})

test('irreconocible → Sin identificar', () => {
  assert.equal(comercioDe(null, null), SIN_IDENTIFICAR)
  assert.equal(comercioDe('', ''), SIN_IDENTIFICAR)
  assert.equal(comercioDe(null, 'PAGO 12 34'), SIN_IDENTIFICAR)
})

test('dos comercios distintos con contraparte vacía NO colapsan', () => {
  const a = comercioDe(null, 'COMPRA EN OSORNITO')
  const b = comercioDe(null, 'COMPRA EN BAZAR YIN YIN')
  assert.notEqual(a, b)
  assert.notEqual(a, SIN_IDENTIFICAR)
  assert.notEqual(b, SIN_IDENTIFICAR)
})
