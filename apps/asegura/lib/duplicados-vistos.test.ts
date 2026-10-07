import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { leerClavesVistas, validarVistos } from './duplicados-vistos.ts'

test('POST: solo una lista de claves; se deduplica; lo demás se rechaza', () => {
  assert.deepEqual(validarVistos({ claves: ['A1|X', 'A1|X', 'B2|'] }), { ok: true, claves: ['A1|X', 'B2|'] })
  assert.deepEqual(validarVistos({ claves: [] }), { ok: true, claves: [] })
  for (const mal of [null, {}, { claves: 'x' }, { claves: [1] }, { claves: [''] }, { claves: ['a'], nombre: 'Juan' }, { claves: Array(501).fill('a') }]) {
    assert.equal(validarVistos(mal).ok, false, JSON.stringify(mal))
  }
})

test('payload ilegible → null (no «ninguna vista»)', () => {
  assert.deepEqual(leerClavesVistas({ claves: ['A1|X'] }), ['A1|X'])
  assert.equal(leerClavesVistas(null), null)
  assert.equal(leerClavesVistas({ claves: 3 }), null)
})

test('el evento se guarda con source, correduria_id y occurred_at', () => {
  const f = readFileSync(new URL('./cartera-duplicados-vistos.ts', import.meta.url), 'utf8')
  assert.match(f, /insert into operational_events \(event_name, source, correduria_id, occurred_at, payload\)/)
  assert.match(f, /order by e\.occurred_at desc/)
})
