import { test } from 'node:test'
import assert from 'node:assert/strict'
import { digitosPolizaSospechosos } from './poliza-digitos-sospechosos.ts'

test('vacío no es sospechoso', () => {
  assert.equal(digitosPolizaSospechosos(''), false)
})

test('dígitos normales, sin ceros seguidos, no son sospechosos', () => {
  assert.equal(digitosPolizaSospechosos('48213'), false)
  assert.equal(digitosPolizaSospechosos('10203'), false)
})

test('dos ceros seguidos NO basta (podría ser real)', () => {
  assert.equal(digitosPolizaSospechosos('30021'), false)
})

test('tres o más ceros seguidos SÍ es el patrón de relleno', () => {
  assert.equal(digitosPolizaSospechosos('00021'), true)
  assert.equal(digitosPolizaSospechosos('10000'), true)
  assert.equal(digitosPolizaSospechosos('00000'), true)
})

test('ignora separadores y letras, mira solo los dígitos', () => {
  assert.equal(digitosPolizaSospechosos('C-000-21'), true)
  assert.equal(digitosPolizaSospechosos('AB 482 13'), false)
})
