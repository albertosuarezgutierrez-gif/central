import assert from 'node:assert/strict'
import { test } from 'node:test'

import { readFileSync } from 'node:fs'

import { DIAS_EFECTO_DEFECTO, limitesFechaEfecto } from './fecha-efecto.ts'

test('min = hoy en Madrid (a las 23:30 UTC ya es mañana allí), max = +90 días', () => {
  assert.deepEqual(limitesFechaEfecto(new Date('2026-09-29T10:00:00Z')), { min: '2026-09-29', max: '2026-12-28' })
  assert.deepEqual(limitesFechaEfecto(new Date('2026-09-29T23:30:00Z')), { min: '2026-09-30', max: '2026-12-29' })
})

test('la ayuda dice los mismos días que pone asegura (DIAS_EFECTO_PRESUPUESTO_NUEVO)', () => {
  const fuente = readFileSync(new URL('../../../asegura/lib/codeoscopic/fecha-efecto.ts', import.meta.url), 'utf8')
  const m = fuente.match(/export const DIAS_EFECTO_PRESUPUESTO_NUEVO = (\d+)/)
  assert.ok(m, 'no se encuentra la constante en asegura: el cepo miraría a ningún sitio')
  assert.equal(DIAS_EFECTO_DEFECTO, Number(m![1]))
})
