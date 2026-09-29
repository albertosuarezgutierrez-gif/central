import assert from 'node:assert/strict'
import { test } from 'node:test'

import { extraerVehiculoGuardado } from './formulario-guardado.ts'

test('vehículo de una petición de moto guardada: código, matrícula, fecha y km', () => {
  const v = extraerVehiculoGuardado({
    risk: { vehicle: { code: 123456 }, registrationPlate: '0000XXX', registrationDate: '2021-03-01', kilometersPerYear: 5000, garageType: { id: 'PrivateGarage' } },
  })
  assert.deepEqual(v, { codigoVehiculo: '123456', matricula: '0000XXX', fechaMatriculacion: '2021-03-01', kmAnuales: 5000, garaje: 'PrivateGarage' })
})

test('sin código de versión no hay vehículo que reutilizar (nada a medias)', () => {
  assert.equal(extraerVehiculoGuardado({ risk: { registrationPlate: '0000XXX' } }), null)
  assert.equal(extraerVehiculoGuardado({ risk: { vehicle: { code: { raro: 1 } } } }), null)
  assert.equal(extraerVehiculoGuardado(null), null)
})

test('lo que falta o viene con forma rara sale null, no inventado', () => {
  const v = extraerVehiculoGuardado({ risk: { vehicle: { code: 'A1' }, kilometersPerYear: 'mucho' } })
  assert.deepEqual(v, { codigoVehiculo: 'A1', matricula: null, fechaMatriculacion: null, kmAnuales: null, garaje: null })
})

test('el garaje viaja con el vehículo: sin él, retomar caía a «vía pública» sin avisar', () => {
  assert.equal(extraerVehiculoGuardado({ risk: { vehicle: { code: 'A1' }, garageType: { id: 3 } } })?.garaje, '3')
  assert.equal(extraerVehiculoGuardado({ risk: { vehicle: { code: 'A1' }, garageType: 'raro' } })?.garaje, null)
})
