import { test } from 'node:test'
import assert from 'node:assert/strict'

import { importeEs } from './importe-es.ts'

test('formatos españoles y sencillos', () => {
  assert.equal(importeEs('412,50'), 412.5)
  assert.equal(importeEs('1.234,56'), 1234.56)
  assert.equal(importeEs('2.162,49€'), 2162.49)
  assert.equal(importeEs('1.234'), 1234)
  assert.equal(importeEs('1234.5'), 1234.5)
  assert.equal(importeEs(' 320 € '), 320)
  assert.equal(importeEs('0'), 0)
})

test('vacío = no lo ha puesto (null), nunca 0', () => {
  assert.equal(importeEs(''), null)
  assert.equal(importeEs('  €'), null)
})

test('lo que no es un importe → NaN, no se adivina', () => {
  for (const t of ['abc', '12,3,4', '1.23,45', '-50', '1,234', '12.3456']) {
    assert.ok(Number.isNaN(importeEs(t)), t)
  }
})
