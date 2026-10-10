import test from 'node:test'
import assert from 'node:assert/strict'
import { validarResolver, leerPayloadCaso, payloadResolucion } from './revision-manual.ts'

const ID = '0b3f6c1e-8a2d-4f55-9c1a-1d2e3f4a5b6c'

test('POST: casoId uuid y decisión del conjunto; lo demás se rechaza', () => {
  for (const decision of ['misma', 'distintas', 'descartar']) assert.equal(validarResolver({ casoId: ID, decision }).ok, true)
  for (const mal of [null, {}, { casoId: 'x', decision: 'misma' }, { casoId: ID, decision: 'fusionar' }, { casoId: ID }, { casoId: ID, decision: 'misma', nota: 'x'.repeat(501) }]) {
    assert.equal(validarResolver(mal).ok, false, JSON.stringify(mal))
  }
})

test('payload de resolución: nota solo si hay', () => {
  assert.deepEqual(payloadResolucion({ casoId: ID, decision: 'misma' }), { caso_id: ID, decision: 'misma' })
  assert.deepEqual(payloadResolucion({ casoId: ID, decision: 'distintas', nota: 'otro riesgo' }), { caso_id: ID, decision: 'distintas', nota: 'otro riesgo' })
})

test('payload de un caso: todo-o-nada con los ids', () => {
  assert.deepEqual(leerPayloadCaso({ poliza_ids: [ID], numero: 'A1', motivo: 'doble import' }), { polizaIds: [ID], numero: 'A1', motivo: 'doble import' })
  assert.equal(leerPayloadCaso({ poliza_ids: [ID, 'no-uuid'], numero: 'A1' }), null)
  assert.equal(leerPayloadCaso({ poliza_ids: [] }), null)
  assert.equal(leerPayloadCaso('x'), null)
})

test('casoId en MAYÚSCULAS se normaliza a minúsculas (si no, salta el filtro de caso abierto y la idempotencia)', () => {
  const r = validarResolver({ casoId: ID.toUpperCase(), decision: 'misma' })
  assert.equal(r.ok && r.datos.casoId, ID)
  assert.deepEqual(payloadResolucion((r as { ok: true; datos: Parameters<typeof payloadResolucion>[0] }).datos), { caso_id: ID, decision: 'misma' })
})
