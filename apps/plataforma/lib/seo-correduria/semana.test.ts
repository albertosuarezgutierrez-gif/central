import { test } from 'node:test'
import assert from 'node:assert/strict'
import { lunesDe } from './semana.ts'

test('lunesDe devuelve el lunes de la semana, en UTC', () => {
  assert.equal(lunesDe(new Date('2026-09-08T08:30:00Z')), '2026-09-07') // martes → lunes 7
  assert.equal(lunesDe(new Date('2026-09-07T00:00:00Z')), '2026-09-07') // el propio lunes
  assert.equal(lunesDe(new Date('2026-09-13T23:59:59Z')), '2026-09-07') // domingo → sigue siendo esa semana
  assert.equal(lunesDe(new Date('2026-09-14T00:00:01Z')), '2026-09-14') // lunes siguiente
})

test('lunesDe no cambia de semana por la hora local: solo cuenta UTC', () => {
  // Un domingo a las 23:30 UTC sigue siendo la semana del lunes 7 aunque en Madrid ya sea lunes.
  assert.equal(lunesDe(new Date('2026-09-13T23:30:00Z')), '2026-09-07')
})
