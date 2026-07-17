import { test } from 'node:test'
import assert from 'node:assert/strict'
import { resumenPasada } from './trading-notify.ts'

test('resumenPasada incluye NAV en formato español y las ideas', () => {
  const txt = resumenPasada('2026-07-17', 2162.49, [{ simbolo: 'NVDA', estrategia: 'momentum', direccion: 'alcista', confianza: 78, operada: true }])
  assert.ok(txt.includes('2.162,49€'))
  assert.ok(txt.includes('NVDA'))
  assert.ok(txt.includes('✅ paper'))
})
