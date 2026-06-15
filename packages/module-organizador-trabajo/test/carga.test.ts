import { test } from 'node:test'
import assert from 'node:assert/strict'
import { estaOcioso } from '../src/carga.ts'

test('estaOcioso: nivel por debajo del umbral → ocioso', () => {
  assert.equal(estaOcioso({ nivel: 1, umbral_ocioso: 3 }), true)
})

test('estaOcioso: nivel igual al umbral → ocioso (borde inclusivo)', () => {
  assert.equal(estaOcioso({ nivel: 3, umbral_ocioso: 3 }), true)
})

test('estaOcioso: nivel por encima del umbral → hay trabajo', () => {
  assert.equal(estaOcioso({ nivel: 5, umbral_ocioso: 3 }), false)
})
