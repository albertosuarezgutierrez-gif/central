import { test } from 'node:test'
import assert from 'node:assert/strict'
import { esLeadSilencioso, UMBRAL_SILENCIO } from './recaptacion-silencio.ts'

test('menos envíos que el umbral nunca es silencioso, aunque no haya abierto nada', () => {
  assert.equal(esLeadSilencioso(UMBRAL_SILENCIO - 1, false), false)
})

test('umbral alcanzado y ninguna apertura → silencioso', () => {
  assert.equal(esLeadSilencioso(UMBRAL_SILENCIO, false), true)
})

test('umbral alcanzado pero con apertura/clic → no se descarta', () => {
  assert.equal(esLeadSilencioso(UMBRAL_SILENCIO, true), false)
})

test('por encima del umbral sigue siendo silencioso', () => {
  assert.equal(esLeadSilencioso(UMBRAL_SILENCIO + 5, false), true)
})
