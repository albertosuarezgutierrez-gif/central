// apps/plataforma/lib/contable/parse.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { extraerAprendizajes } from './parse.ts'

test('sin línea APRENDER → texto intacto, sin aprendizajes', () => {
  const r = extraerAprendizajes('Llevas 320€ en luz este mes.')
  assert.equal(r.limpio, 'Llevas 320€ en luz este mes.')
  assert.deepEqual(r.aprendizajes, [])
})

test('una línea APRENDER → se extrae y se quita del texto', () => {
  const r = extraerAprendizajes(
    'Entendido, lo recordaré.\nAPRENDER: {"clave":"criterio_gasto","insight":"Meter todo el gasto en el año, no amortizar de oficio"}')
  assert.equal(r.limpio, 'Entendido, lo recordaré.')
  assert.deepEqual(r.aprendizajes, [{ clave: 'criterio_gasto', insight: 'Meter todo el gasto en el año, no amortizar de oficio' }])
})

test('JSON mal formado → se ignora, no rompe', () => {
  const r = extraerAprendizajes('Vale.\nAPRENDER: {roto')
  assert.equal(r.limpio, 'Vale.')
  assert.deepEqual(r.aprendizajes, [])
})

test('dos líneas APRENDER → dos aprendizajes y texto limpio', () => {
  const r = extraerAprendizajes(
    'Ok.\nAPRENDER: {"clave":"a","insight":"uno"}\nAPRENDER: {"clave":"b","insight":"dos"}')
  assert.equal(r.aprendizajes.length, 2)
  assert.equal(r.limpio, 'Ok.')
})

test('clave/insight vacíos → se descartan', () => {
  const r = extraerAprendizajes('X\nAPRENDER: {"clave":"","insight":"algo"}')
  assert.deepEqual(r.aprendizajes, [])
})
