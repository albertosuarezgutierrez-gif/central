import { test } from 'node:test'
import assert from 'node:assert'
import { contieneDatoInventado } from './guardrail.ts'

const fuentes = 'WiFi: HouseSevillana clave Sevilla2026. Check-in 15:00. Tel +34 600111222.'

test('detecta un código que no está en fuentes', () => {
  assert.equal(contieneDatoInventado('La clave del portal es 4471', fuentes), true)
})
test('no marca si el dato está en fuentes', () => {
  assert.equal(contieneDatoInventado('La clave wifi es Sevilla2026', fuentes), false)
})
test('no marca texto sin datos concretos', () => {
  assert.equal(contieneDatoInventado('Encantado de ayudarte con tu estancia', fuentes), false)
})
test('detecta teléfono inventado', () => {
  assert.equal(contieneDatoInventado('Llama al +34 699888777', fuentes), true)
})
test('permite la hora 15:00 que sí está', () => {
  assert.equal(contieneDatoInventado('El check-in es a las 15:00', fuentes), false)
})
