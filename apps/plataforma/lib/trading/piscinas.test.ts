import { test } from 'node:test'
import assert from 'node:assert/strict'
import { enPiscina, PISCINAS, PISCINA_VIVA, type Piscina } from './piscinas.ts'

test('«todos» acepta las tres direcciones', () => {
  for (const d of ['alcista', 'bajista', 'neutral'] as const) {
    assert.equal(enPiscina(d, 'todos'), true)
  }
})

// La piscina viva es una DECISIÓN RESUELTA (H11, 31/08/2026), no un default: cambiarla exige re-abrir
// la hipótesis por PR. Este pin existe para que un refactor no la mueva sin que salte un test.
test('la piscina viva es «direccional» (H11 resuelta 31/08/2026)', () => {
  assert.equal(PISCINA_VIVA, 'direccional')
})

// Guardián del cableado: `analizar` tiene que leer las stats por PISCINA_VIVA, no por un literal.
// Un `regimen: 'todos'` re-introducido a mano desharía la resolución de H11 en silencio — tsc no lo
// caza (es un string válido) y este test sí (lee el FUENTE, patrón cols-subasta.test.ts).
test('analizar consume las stats de PISCINA_VIVA, sin literal de regimen', async () => {
  const { readFile } = await import('node:fs/promises')
  const fuente = await readFile(new URL('../../app/api/trading/analizar/route.ts', import.meta.url), 'utf8')
  assert.match(fuente, /regimen:\s*PISCINA_VIVA/)
  assert.doesNotMatch(fuente, /regimen:\s*['"]todos['"]/)
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
