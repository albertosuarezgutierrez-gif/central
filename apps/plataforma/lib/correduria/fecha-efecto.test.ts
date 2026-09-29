import assert from 'node:assert/strict'
import { test } from 'node:test'

import { limitesFechaEfecto } from './fecha-efecto.ts'

test('min = hoy en Madrid (a las 23:30 UTC ya es mañana allí), max = +90 días', () => {
  assert.deepEqual(limitesFechaEfecto(new Date('2026-09-29T10:00:00Z')), { min: '2026-09-29', max: '2026-12-28' })
  assert.deepEqual(limitesFechaEfecto(new Date('2026-09-29T23:30:00Z')), { min: '2026-09-30', max: '2026-12-29' })
})
