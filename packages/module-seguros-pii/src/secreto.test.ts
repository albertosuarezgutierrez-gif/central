import test from 'node:test'
import assert from 'node:assert/strict'
import { secretosIguales, bearerAutorizado } from './secreto.ts'

test('secretosIguales acepta el valor idéntico y rechaza cualquier variación', () => {
  assert.equal(secretosIguales('un-secreto-largo', 'un-secreto-largo'), true)
  assert.equal(secretosIguales('un-secreto-largo', 'un-secreto-largX'), false)
  assert.equal(secretosIguales('un-secreto-largo', 'Un-secreto-largo'), false)
  // Longitudes distintas: no puede lanzar (timingSafeEqual pelado sí lo haría,
  // y un throw dentro de la autorización se lee como 500, no como 401).
  assert.equal(secretosIguales('un-secreto-largo', 'un-secreto'), false)
})

test('fail-closed: sin secreto configurado NADIE entra', () => {
  assert.equal(secretosIguales(undefined, 'lo-que-sea'), false)
  assert.equal(secretosIguales('lo-que-sea', undefined), false)
  assert.equal(secretosIguales(null, null), false)
  assert.equal(secretosIguales('', ''), false, 'dos vacíos son iguales y NO pueden autorizar')
})

test('bearerAutorizado exige la cabecera completa y el esquema exacto', () => {
  assert.equal(bearerAutorizado('Bearer abc123', 'abc123'), true)
  assert.equal(bearerAutorizado('bearer abc123', 'abc123'), false, 'el esquema es sensible a mayúsculas, como antes con ===')
  assert.equal(bearerAutorizado('Bearer  abc123', 'abc123'), false, 'dos espacios no son la misma cabecera')
  assert.equal(bearerAutorizado('abc123', 'abc123'), false, 'sin esquema no es un Bearer')
  assert.equal(bearerAutorizado('Bearer abc124', 'abc123'), false)
})

test('bearerAutorizado sin secreto o sin cabecera no autoriza', () => {
  assert.equal(bearerAutorizado('Bearer abc123', undefined), false)
  assert.equal(bearerAutorizado('Bearer abc123', ''), false)
  assert.equal(bearerAutorizado(null, 'abc123'), false)
  assert.equal(bearerAutorizado('', 'abc123'), false)
})
