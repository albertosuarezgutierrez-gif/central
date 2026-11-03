import { test } from 'node:test'
import assert from 'node:assert/strict'

import { familiaSeguro } from './familia-seguro.ts'

test('personales: vida, salud, accidentes, decesos, viaje, mascotas', () => {
  for (const r of ['vida', 'salud', 'accidentes', 'decesos', 'viaje', 'mascotas', ' Salud ']) {
    assert.deepEqual(familiaSeguro(r, false), { familia: 'personales', sublinea: null }, r)
  }
})

test('patrimoniales: inmuebles y VEHÍCULOS dentro (decisión de Alberto, 24/10/2026), y RC sin sublínea', () => {
  assert.deepEqual(familiaSeguro('hogar', false), { familia: 'patrimoniales', sublinea: 'inmuebles' })
  assert.deepEqual(familiaSeguro('impago_alquiler', false), { familia: 'patrimoniales', sublinea: 'inmuebles' })
  assert.deepEqual(familiaSeguro('auto', false), { familia: 'patrimoniales', sublinea: 'vehiculos' })
  assert.deepEqual(familiaSeguro('moto', false), { familia: 'patrimoniales', sublinea: 'vehiculos' })
  assert.deepEqual(familiaSeguro('patinete', false), { familia: 'patrimoniales', sublinea: 'vehiculos' })
  assert.deepEqual(familiaSeguro('embarcaciones', false), { familia: 'patrimoniales', sublinea: 'vehiculos' })
  assert.deepEqual(familiaSeguro('responsabilidad_civil', false), { familia: 'patrimoniales', sublinea: null })
})

test('🚨 el titular jurídico manda sobre el ramo: una salud colectiva es «De tu empresa»', () => {
  assert.deepEqual(familiaSeguro('salud', true), { familia: 'empresa', sublinea: null })
  assert.deepEqual(familiaSeguro('auto', true), { familia: 'empresa', sublinea: 'vehiculos' })
  assert.deepEqual(familiaSeguro(null, true), { familia: 'empresa', sublinea: null })
})

test('🚨 lo que no se reconoce va a «Otros», no se esconde ni se mete en otra familia', () => {
  for (const r of ['otros', null, undefined, '', 'seguro raro', 'OTRO']) {
    assert.deepEqual(familiaSeguro(r, false), { familia: 'otros', sublinea: null }, String(r))
  }
})
