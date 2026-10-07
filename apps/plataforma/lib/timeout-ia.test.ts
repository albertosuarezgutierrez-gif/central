import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { acotarTimeoutMs } from './timeout-ia.ts'

test('acotarTimeoutMs: default 25 s sin valor válido', () => {
  for (const v of [undefined, null, '', 'x', 0, NaN]) assert.equal(acotarTimeoutMs(v), 25_000)
})
test('acotarTimeoutMs: respeta el pedido dentro de rango', () => {
  assert.equal(acotarTimeoutMs(50_000), 50_000)
  assert.equal(acotarTimeoutMs('40000'), 40_000)
})
test('acotarTimeoutMs: tope 55 s y mínimo 1 s', () => {
  assert.equal(acotarTimeoutMs(600_000), 55_000)
  assert.equal(acotarTimeoutMs(5), 1_000)
  assert.equal(acotarTimeoutMs(-10), 1_000)
})
test('la ruta /api/ai/chat usa acotarTimeoutMs y su maxDuration cubre el tope', () => {
  const src = readFileSync(new URL('../app/api/ai/chat/route.ts', import.meta.url), 'utf8')
  assert.match(src, /timeoutMs:\s*acotarTimeoutMs\(body\?\.timeoutMs\)/)
  assert.match(src, /maxDuration\s*=\s*60/)
})
