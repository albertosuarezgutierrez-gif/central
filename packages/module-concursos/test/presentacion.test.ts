// Tests de la lógica PURA de presentación + plazos (F6).
// Runner integrado de Node (type-stripping): `node --test`.
import { test } from 'node:test'
import assert from 'node:assert/strict'

import { diasEntre, sumarDiasHabiles } from '../src/presentacion.ts'

test('diasEntre: diferencia en días naturales (hasta − desde)', () => {
  assert.equal(diasEntre('2026-06-11', '2026-06-20'), 9)
  assert.equal(diasEntre('2026-06-20', '2026-06-11'), -9)
  assert.equal(diasEntre('2026-06-11', '2026-06-11'), 0)
})

test('sumarDiasHabiles: salta sábados y domingos', () => {
  // jueves 2026-06-11 + 3 hábiles → vie 12, lun 15, mar 16
  assert.equal(sumarDiasHabiles('2026-06-11', 3), '2026-06-16')
  // viernes 2026-06-12 + 1 hábil → lunes 15
  assert.equal(sumarDiasHabiles('2026-06-12', 1), '2026-06-15')
})

test('sumarDiasHabiles: 0 días devuelve la misma fecha', () => {
  assert.equal(sumarDiasHabiles('2026-06-11', 0), '2026-06-11')
})
