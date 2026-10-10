import { test } from 'node:test'
import assert from 'node:assert/strict'
import { diferenciasVariante, resumenDiferencias, limpiarFiguras, rolesDelRamo } from './variantes-riesgo.ts'

const persona = (dni: string, name: string, extra: Record<string, unknown> = {}) => ({
  identificationDocument: { type: { id: 'Dni' }, id: dni }, name, surname: 'Piña', birthDate: '1980-01-01',
  drivingLicenses: [{ type: { id: 'B' }, date: '2000-01-01' }], ...extra,
})
const moto = (tomador: object, cp = '41003', garaje = 'Street') => ({
  insuranceLine: { id: 'Motorcycle' }, effectiveDate: '2026-10-01', holder: tomador,
  risk: { vehicle: { code: 'X1' }, registrationPlate: '2121NST', circulationAddress: { postalCode: cp, town: { id: 1 } },
    garageType: { id: garaje }, kilometersPerYear: 5000, owner: tomador, primaryDriver: tomador },
})

test('otra persona de tomador (otro DNI) sale como cambio de persona, con su nombre y sin DNI', () => {
  const d = diferenciasVariante(moto(persona('1A', 'Manuel')), moto(persona('2B', 'Antonio')))!
  assert.deepEqual(d.find((x) => x.campo === 'Tomador'), { campo: 'Tomador', antes: 'Manuel Piña', despues: 'Antonio Piña' })
  assert.ok(!JSON.stringify(d).includes('1A'), 'el DNI no sale en el resumen')
})

test('mismo DNI con otro carnet es una corrección, no otra persona', () => {
  const d = diferenciasVariante(moto(persona('1A', 'Manuel')), moto(persona('1A', 'Manuel', { drivingLicenses: [{ date: '2005-01-01' }] })))!
  assert.ok(d.some((x) => x.campo === 'Tomador: carnet' && x.despues === '2005-01-01'))
  assert.ok(!d.some((x) => x.campo === 'Tomador'))
})

test('CP y garaje cambian; sin cambios dice «mismos datos»', () => {
  const a = moto(persona('1A', 'Manuel'))
  const d = diferenciasVariante(a, moto(persona('1A', 'Manuel'), '11520', 'PrivateGarage'))!
  assert.deepEqual(d.map((x) => x.campo), ['CP de circulación', 'Garaje'])
  assert.equal(resumenDiferencias(diferenciasVariante(a, a)), 'Mismos datos que la anterior')
})

test('sin petición legible NO es «igual»: es no comparable', () => {
  assert.equal(diferenciasVariante(null, moto(persona('1A', 'M'))), null)
  assert.equal(resumenDiferencias(null), 'No se puede comparar con la anterior')
})

test('limpiarFiguras descarta roles y ids que no son', () => {
  const u = '11111111-2222-3333-4444-555555555555'
  assert.deepEqual(limpiarFiguras({ tomador: u, propietario: null, jefe: u, conductor_habitual: 'x' }), { tomador: u, propietario: null })
  assert.equal(limpiarFiguras({ jefe: u }), null)
  assert.deepEqual(rolesDelRamo('moto'), ['tomador', 'propietario', 'conductor_habitual'])
})
