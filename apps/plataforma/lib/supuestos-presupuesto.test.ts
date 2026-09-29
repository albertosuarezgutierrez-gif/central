import { test } from 'node:test'
import assert from 'node:assert/strict'
import { estadoCivilPorDefecto, garajePorDefecto } from './supuestos-presupuesto.ts'

test('garajePorDefecto: el comunitario; si no, otro garaje; NUNCA la calle ni la vía pública', () => {
  const cat = [{ id: 'PublicRoad', nombre: 'Vía pública' }, { id: 'PrivateGarage', nombre: 'Garaje individual' }, { id: 'CommunalParking', nombre: 'Garaje comunitario' }]
  assert.equal(garajePorDefecto(cat)?.id, 'CommunalParking')
  assert.equal(garajePorDefecto([cat[0], cat[1]])?.id, 'PrivateGarage')
  // Por el id, si el nombre no dice nada.
  assert.equal(garajePorDefecto([{ id: 'Street', nombre: 'En la calle' }, { id: 'Garage', nombre: 'Otro' }])?.id, 'Garage')
  assert.equal(garajePorDefecto([{ id: 'Street', nombre: 'En la calle' }, { id: 'X', nombre: 'Parking público' }]), null)
  assert.equal(garajePorDefecto([]), null)
})

test('estadoCivilPorDefecto: soltero; sin él en el catálogo, null (se pregunta)', () => {
  assert.equal(estadoCivilPorDefecto([{ id: 'Married', nombre: 'Casado/a' }, { id: 'Single', nombre: 'Soltero/a' }])?.id, 'Single')
  assert.equal(estadoCivilPorDefecto([{ id: 'Single', nombre: 'S' }])?.id, 'Single')
  assert.equal(estadoCivilPorDefecto([{ id: 'Married', nombre: 'Casado/a' }]), null)
})
