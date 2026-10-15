import { test } from 'node:test'
import assert from 'node:assert/strict'
import { CLAVE_OCASIONAL_INFO, confirmacionSinOcasionalDe, corteOcasional, estadoOcasional, valorSinOcasional } from './conductor-ocasional.ts'

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

test('estadoOcasional: hueco = sin preguntar; null (no se sabe) también; ficha manda; sin papel no aplica', () => {
  const roles = ['tomador', 'propietario', 'conductor_habitual', 'conductor_ocasional'] as const
  const conf = { ningunoConfirmadoAt: '2026-10-15T10:00:00.000Z' }
  assert.equal(estadoOcasional({ roles, figuras: [], conductorOcasional: { ningunoConfirmadoAt: null } }), 'sin_preguntar')
  assert.equal(estadoOcasional({ roles, figuras: [], conductorOcasional: null }), 'sin_preguntar')
  assert.equal(estadoOcasional({ roles, figuras: [], conductorOcasional: conf }), 'ninguno')
  assert.equal(estadoOcasional({ roles, figuras: [{ rol: 'conductor_ocasional' }], conductorOcasional: conf }), 'si')
  assert.equal(estadoOcasional({ roles: ['tomador', 'propietario', 'conductor_habitual'], figuras: [], conductorOcasional: null }), 'no_aplica')
})

test('corteOcasional: SOLO «sin preguntar» corta el precio, con un motivo que dice dónde se arregla', () => {
  assert.match(corteOcasional('sin_preguntar') ?? '', /Conduce alguien más\?[\s\S]*Intervinientes/)
  assert.equal(corteOcasional('ninguno'), null)
  assert.equal(corteOcasional('si'), null)
  assert.equal(corteOcasional('no_aplica'), null)
})
