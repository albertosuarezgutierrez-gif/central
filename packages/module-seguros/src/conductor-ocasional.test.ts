import { test } from 'node:test'
import assert from 'node:assert/strict'
import { CLAVE_OCASIONAL_INFO, confirmacionSinOcasionalDe, valorSinOcasional } from './conductor-ocasional.ts'

test('confirmacionSinOcasionalDe: solo { ninguno: true, confirmadoAt } cuenta como confirmado', () => {
  const v = valorSinOcasional('2026-10-15T10:00:00.000Z', 'alberto@x')
  assert.deepEqual(confirmacionSinOcasionalDe({ [CLAVE_OCASIONAL_INFO]: v, datosVehiculo: {} }), { confirmadoAt: '2026-10-15T10:00:00.000Z', actor: 'alberto@x' })
})

test('confirmacionSinOcasionalDe: un hueco NO es «no hay» (null = sin preguntar)', () => {
  assert.equal(confirmacionSinOcasionalDe(null), null)
  assert.equal(confirmacionSinOcasionalDe({}), null)
  assert.equal(confirmacionSinOcasionalDe({ [CLAVE_OCASIONAL_INFO]: { ninguno: false, confirmadoAt: '2026-10-15' } }), null)
  assert.equal(confirmacionSinOcasionalDe({ [CLAVE_OCASIONAL_INFO]: { ninguno: true } }), null, 'sin fecha no consta la confirmación')
  assert.equal(confirmacionSinOcasionalDe({ [CLAVE_OCASIONAL_INFO]: { ninguno: 'true', confirmadoAt: '2026-10-15' } }), null)
  assert.equal(confirmacionSinOcasionalDe({ [CLAVE_OCASIONAL_INFO]: [] }), null)
})
