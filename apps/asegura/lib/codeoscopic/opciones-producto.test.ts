import { test } from 'node:test'
import assert from 'node:assert/strict'
import { opcionesPorDefecto } from './opciones-producto.ts'

test('opcionesPorDefecto: Allianz trae las 14 opciones portadas del CRM, con naturalPhenomena=false', () => {
  const o = opcionesPorDefecto('Allianz')
  assert.ok(o)
  assert.equal(o.length, 14)
  const fenomenos = o.find((x) => x.id === 'naturalPhenomena')
  assert.deepEqual(fenomenos, { id: 'naturalPhenomena', type: 'boolean', value: false })
})

test('opcionesPorDefecto: casa por nombre sin distinguir mayúsculas ni espacios', () => {
  assert.ok(opcionesPorDefecto('ALLIANZ Seguros'))
  assert.ok(opcionesPorDefecto('  allianz  '))
})

test('opcionesPorDefecto: sin catálogo para el resto de compañías → null', () => {
  assert.equal(opcionesPorDefecto('Reale'), null)
  assert.equal(opcionesPorDefecto('Mapfre'), null)
  assert.equal(opcionesPorDefecto('Fidelidade'), null)
})
