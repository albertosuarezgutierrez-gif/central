import { test } from 'node:test'
import assert from 'node:assert/strict'
import { limiteMensualEfectivo } from './ia-limite-mensual.ts'

test('la fila de BD manda sobre la env cuando tiene valor', () => {
  assert.equal(limiteMensualEfectivo(12000, '5000'), 12000)
  assert.equal(limiteMensualEfectivo(0, '5000'), 0) // 0 en BD = sin límite, aunque la env limite
})

test('sin fila en BD (null/undefined) manda la env', () => {
  assert.equal(limiteMensualEfectivo(null, '5000'), 5000)
  assert.equal(limiteMensualEfectivo(undefined, '5000'), 5000)
})

test('sin fila y sin env = sin límite', () => {
  assert.equal(limiteMensualEfectivo(null, undefined), 0)
  assert.equal(limiteMensualEfectivo(undefined, ''), 0)
})

test('un mando corrupto no apaga la pasarela: negativo o ilegible → sin límite', () => {
  assert.equal(limiteMensualEfectivo(-5, '5000'), 0)
  assert.equal(limiteMensualEfectivo(null, '-3'), 0)
  assert.equal(limiteMensualEfectivo(null, 'abc'), 0)
  assert.equal(limiteMensualEfectivo(NaN, '5000'), 5000) // NaN en BD no es un valor: cae a la env
})
