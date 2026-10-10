import { test } from 'node:test'
import assert from 'node:assert/strict'
import { calcularBonificacion, leerNumero } from './bonificacion-hipoteca.ts'

test('el ejemplo de Alberto: 40.000 € al 0,50 % bonifican 200 €; un seguro de 500 € cuesta de verdad 300 €', () => {
  assert.deepEqual(calcularBonificacion({ capital: '40.000', puntos: '0,5', prima: '500' }), {
    prima: 500,
    bonificacion: 200,
    costeReal: 300,
    compensa: false,
  })
})

test('si la bonificación vale más que el seguro, el coste real es negativo y se dice (no se esconde en 0)', () => {
  const r = calcularBonificacion({ capital: '200000', puntos: '0.30', prima: '450' })
  assert.deepEqual(r, { prima: 450, bonificacion: 600, costeReal: -150, compensa: true })
})

test('con cualquier dato sin poner no hay resultado: null, nunca 0', () => {
  assert.equal(calcularBonificacion({ capital: '', puntos: '0,5', prima: '500' }), null)
  assert.equal(calcularBonificacion({ capital: '40000', puntos: '', prima: '500' }), null)
  assert.equal(calcularBonificacion({ capital: '40000', puntos: '0,5', prima: 'abc' }), null)
})

test('lee números a la española: miles con punto, decimales con coma, € y % sueltos', () => {
  assert.equal(leerNumero('150.000'), 150000)
  assert.equal(leerNumero('1.234.567,89'), 1234567.89)
  assert.equal(leerNumero('0,25'), 0.25)
  assert.equal(leerNumero('0.25'), 0.25)
  assert.equal(leerNumero(' 500 € '), 500)
  assert.equal(leerNumero('0,5 %'), 0.5)
  assert.equal(leerNumero('-3'), null)
  assert.equal(leerNumero(''), null)
})
