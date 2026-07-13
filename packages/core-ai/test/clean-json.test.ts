// Tests de cleanJSON: quita fences markdown y recorta prosa antes/después del
// JSON. PURO. Se ejecuta con el runner de Node: `node --test test/*.test.ts`.

import { test } from 'node:test'
import assert from 'node:assert/strict'

import { cleanJSON } from '../src/clean-json.ts'

test('objeto JSON limpio se devuelve intacto', () => {
  const s = '{"modelo":"deepseek/deepseek-chat"}'
  assert.equal(cleanJSON(s), s)
})

test('quita las fences ```json … ```', () => {
  const s = '```json\n{"modelo":"x"}\n```'
  assert.deepEqual(JSON.parse(cleanJSON(s)), { modelo: 'x' })
})

test('recorta la prosa DESPUÉS del objeto (el bug residual del Director)', () => {
  const s = '{"modelo":"x"}\nElijo este modelo porque es barato.'
  assert.deepEqual(JSON.parse(cleanJSON(s)), { modelo: 'x' })
})

test('recorta la prosa ANTES del objeto', () => {
  const s = 'Aquí tienes la elección: {"modelo":"x"}'
  assert.deepEqual(JSON.parse(cleanJSON(s)), { modelo: 'x' })
})

test('fences + prosa final combinados', () => {
  const s = '```json\n{"modelo":"y"}\n```\nEspero que te sirva.'
  assert.deepEqual(JSON.parse(cleanJSON(s)), { modelo: 'y' })
})

test('no confunde llaves dentro de cadenas', () => {
  const s = '{"nota":"usa } con cuidado","modelo":"z"}'
  assert.deepEqual(JSON.parse(cleanJSON(s)), { nota: 'usa } con cuidado', modelo: 'z' })
})

test('respeta comillas escapadas dentro de cadenas', () => {
  const s = '{"nota":"dijo \\"hola\\" }","modelo":"z"} sobra'
  assert.deepEqual(JSON.parse(cleanJSON(s)), { nota: 'dijo "hola" }', modelo: 'z' })
})

test('soporta arrays de primer nivel', () => {
  const s = 'resultado: [1,2,3] fin'
  assert.deepEqual(JSON.parse(cleanJSON(s)), [1, 2, 3])
})

test('objeto anidado se mantiene completo', () => {
  const s = '{"a":{"b":1}} y algo más'
  assert.deepEqual(JSON.parse(cleanJSON(s)), { a: { b: 1 } })
})

test('sin JSON balanceado devuelve el texto sin fences', () => {
  assert.equal(cleanJSON('```\nno hay json aqui\n```'), 'no hay json aqui')
})

test('objeto sin cerrar no se trunca a la fuerza (devuelve tal cual)', () => {
  const s = '{"modelo":"x"'
  assert.equal(cleanJSON(s), s)
})
