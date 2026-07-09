// Integridad del catálogo de agentes del panel. Runner: `node --test` (type-stripping).
import { test } from 'node:test'
import assert from 'node:assert/strict'

import { AGENTES, FAMILIAS } from './agentes-catalogo.ts'

test('ids únicos', () => {
  const ids = AGENTES.map(a => a.id)
  assert.equal(new Set(ids).size, ids.length)
})

test('todos los campos de texto están rellenos', () => {
  for (const a of AGENTES) {
    for (const campo of ['nombre', 'funcion', 'cadencia', 'disparo', 'archivo', 'vertical'] as const) {
      assert.ok(a[campo] && a[campo].trim().length > 0, `${a.id}.${campo} vacío`)
    }
  }
})

test('las familias cubren exactamente todos los agentes (sin duplicar)', () => {
  const enFamilias = FAMILIAS.flatMap(f => f.agentes.map(a => a.id))
  assert.equal(enFamilias.length, AGENTES.length)
  assert.deepEqual(new Set(enFamilias), new Set(AGENTES.map(a => a.id)))
})
