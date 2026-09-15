import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mapearRespuesta } from './apivehiculo.ts'

// Ejemplo literal de la documentación OpenAPI de APIVehículo (15/09/2026).
const EJEMPLO_DOC = {
  plate: '1234ABC', country: 'ES', brand: 'Volkswagen', model: 'Golf',
  version: '2.0 TDI 150 CV', firstRegistrationDate: '2018-03-15',
  fuelType: 'Diesel', powerKW: '110', powerHP: '150', fiscalPower: '7',
  vin: 'WVWZZZ1KZAM123456', transmissionType: 'FWD',
  passengerCount: 5, doorCount: 5, displacementCcm: '1968',
  vehicleType: 'Passenger Car', bodyType: 'Hatchback (3 or 5 doors)',
}

test('mapearRespuesta traduce los campos reales del proveedor', () => {
  const d = mapearRespuesta('1234ABC', EJEMPLO_DOC)
  assert.equal(d.marca, 'Volkswagen')
  assert.equal(d.modelo, 'Golf')
  assert.equal(d.version, '2.0 TDI 150 CV')
  assert.equal(d.potenciaCv, 150)
  assert.equal(d.potenciaKw, 110)
  assert.equal(d.cilindradaCc, 1968)
  assert.equal(d.combustible, 'Diesel')
  assert.equal(d.fechaMatriculacion, '2018-03-15')
  assert.equal(d.vin, 'WVWZZZ1KZAM123456')
  assert.equal(d.transmision, 'FWD')
  assert.equal(d.numeroPlazas, 5)
  assert.equal(d.numeroPuertas, 5)
  assert.equal(d.potenciaFiscal, 7)
  assert.equal(d.tipoVehiculo, 'Passenger Car')
  assert.equal(d.tipoCarroceria, 'Hatchback (3 or 5 doors)')
})

test('mapearRespuesta no revienta con campos ausentes', () => {
  const d = mapearRespuesta('9999ZZZ', {})
  assert.equal(d.marca, null)
  assert.equal(d.potenciaCv, null)
})
