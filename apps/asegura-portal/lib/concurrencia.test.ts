import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { mapConConcurrencia } from './concurrencia.ts'

test('respeta el tope de concurrencia, mantiene el orden y procesa todo', async () => {
  let vivos = 0
  let maximo = 0
  const r = await mapConConcurrencia([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], 5, async (n) => {
    vivos++
    maximo = Math.max(maximo, vivos)
    await new Promise((res) => setTimeout(res, 5 + (n % 3)))
    vivos--
    return n * 2
  })
  assert.deepEqual(r, [2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24])
  assert.equal(maximo, 5)
})

test('lista vacía, límite raro y límite mayor que la lista', async () => {
  assert.deepEqual(await mapConConcurrencia([], 5, async () => 1), [])
  assert.deepEqual(await mapConConcurrencia([1, 2], 0, async (n) => n), [1, 2])
  assert.deepEqual(await mapConConcurrencia([1, 2], Number.NaN, async (n) => n), [1, 2])
  assert.deepEqual(await mapConConcurrencia([1, 2], 99, async (n) => n), [1, 2])
})

test('🪤 H5: el cron de avisos-push pregunta por las bajas con concurrencia limitada, no en serie', () => {
  const cron = readFileSync(new URL('../app/api/cron/avisos-push/route.ts', import.meta.url), 'utf8')
  assert.match(cron, /mapConConcurrencia\([^)]*CONCURRENCIA_PUENTE/)
  assert.match(cron, /const CONCURRENCIA_PUENTE = 5/)
  assert.doesNotMatch(cron, /for \(const id of new Set\([\s\S]{0,200}await anulacionesPendientes/)
})
