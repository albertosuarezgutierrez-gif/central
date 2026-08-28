import { test } from 'node:test'
import assert from 'node:assert/strict'
import { enPiscina, PISCINAS, PISCINA_VIVA, type Piscina } from './piscinas.ts'

test('«todos» acepta las tres direcciones (es la piscina viva, no debe cambiar)', () => {
  for (const d of ['alcista', 'bajista', 'neutral'] as const) {
    assert.equal(enPiscina(d, 'todos'), true)
  }
  assert.equal(PISCINA_VIVA, 'todos')
})

test('«direccional» excluye SOLO las neutrales — que son las que el torneo nunca ajusta', () => {
  assert.equal(enPiscina('alcista', 'direccional'), true)
  assert.equal(enPiscina('bajista', 'direccional'), true)
  assert.equal(enPiscina('neutral', 'direccional'), false)
})

test('«alcista» deja fuera también a las bajistas: es lo único que el agente compra', () => {
  assert.equal(enPiscina('alcista', 'alcista'), true)
  assert.equal(enPiscina('bajista', 'alcista'), false)
  assert.equal(enPiscina('neutral', 'alcista'), false)
})

test('las tres piscinas están declaradas y «todos» va la primera', () => {
  assert.deepEqual([...PISCINAS], ['todos', 'direccional', 'alcista'])
})

test('cada piscina es un subconjunto de la anterior (alcista ⊆ direccional ⊆ todos)', () => {
  const dirs = ['alcista', 'bajista', 'neutral'] as const
  const cuenta = (p: Piscina) => dirs.filter(d => enPiscina(d, p)).length
  assert.ok(cuenta('alcista') <= cuenta('direccional'))
  assert.ok(cuenta('direccional') <= cuenta('todos'))
  for (const d of dirs) {
    if (enPiscina(d, 'alcista')) assert.equal(enPiscina(d, 'direccional'), true)
    if (enPiscina(d, 'direccional')) assert.equal(enPiscina(d, 'todos'), true)
  }
})
