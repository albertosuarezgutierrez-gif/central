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

import { stripThink } from './parse.ts'

test('stripThink: respuesta normal → intacta (no-op)', () => {
  assert.equal(stripThink('Llevas 320€ en luz este mes.'), 'Llevas 320€ en luz este mes.')
})

test('stripThink: quita bloque <think>…</think> y deja la respuesta', () => {
  const raw = '<think>El usuario pregunta por la luz. Sumo Endesa…</think>\nLlevas 320€ en luz.'
  assert.equal(stripThink(raw), 'Llevas 320€ en luz.')
})

test('stripThink: <think> sin cerrar (truncado) → se elimina todo el razonamiento', () => {
  assert.equal(stripThink('Texto previo. <think>razonando y me corté'), 'Texto previo.')
})

test('stripThink: el razonamiento NO contamina APRENDER/ACCION', () => {
  const raw = '<think>debería proponer clasificar</think>\nTe lo clasifico.\nACCION: {"tipo":"confirmar","ref":"#2"}'
  const limpio = stripThink(raw)
  const r = extraerAcciones(limpio)
  assert.equal(r.acciones.length, 1)
  assert.equal(r.limpio, 'Te lo clasifico.')
})

import { extraerAcciones } from './parse.ts'

test('extraerAcciones: sin línea ACCION → vacío, texto intacto', () => {
  const r = extraerAcciones('Te propongo clasificarlo.')
  assert.equal(r.limpio, 'Te propongo clasificarlo.')
  assert.deepEqual(r.acciones, [])
})

test('extraerAcciones: una acción → parseada y quitada del texto', () => {
  const r = extraerAcciones('Voy a clasificarlo.\nACCION: {"tipo":"clasificar","ref":"#3","destino":"turistico_pisos"}')
  assert.equal(r.limpio, 'Voy a clasificarlo.')
  assert.equal(r.acciones.length, 1)
  assert.equal(r.acciones[0].tipo, 'clasificar')
  assert.equal(r.acciones[0].ref, '#3')
  assert.equal(r.acciones[0].destino, 'turistico_pisos')
})

test('extraerAcciones: JSON sin "tipo" o mal formado → ignorado', () => {
  const r = extraerAcciones('X\nACCION: {"ref":"#1"}\nACCION: {roto')
  assert.deepEqual(r.acciones, [])
  assert.equal(r.limpio, 'X')
})

test('extraerAcciones: dos acciones', () => {
  const r = extraerAcciones('Ok.\nACCION: {"tipo":"clasificar","ref":"#1","destino":"personal"}\nACCION: {"tipo":"amortizable","ref":"#1","valor":true}')
  assert.equal(r.acciones.length, 2)
  assert.equal(r.limpio, 'Ok.')
})
