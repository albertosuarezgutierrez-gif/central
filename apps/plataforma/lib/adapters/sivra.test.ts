// Guardián: la métrica «Gastos mes» lee `gastos` (vigentes, de pisos), no la tabla congelada `expenses`.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const src = readFileSync(new URL('./sivra.ts', import.meta.url), 'utf8')

test('sivra adapter: gastos del mes salen de `gastos`, no de `expenses`', () => {
  assert.doesNotMatch(src, /FROM expenses\b/)
  assert.match(src, /FROM gastos\b/)
  assert.match(src, /sqlGastoVigente\(\)/)
  assert.match(src, /sqlGastoDePisos\(\)/)
})
