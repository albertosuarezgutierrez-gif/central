import test from 'node:test'
import assert from 'node:assert/strict'
import { datosVehiculoDeDocumento, SIN_IDS_CATALOGO } from './datos-vehiculo-documento.ts'

const HOY = '2026-10-05'
const IDS = { marcaId: '731', modeloId: '8689', motorId: 'Electric', codigoVehiculo: '123456' }

test('con todo lo leído: estructurado, normalizado y SIN confirmar', () => {
  const d = datosVehiculoDeDocumento(
    { matricula: '1234 abc', marca: 'TESLA', modelo: 'Model 3', version: 'Long Range', fechaMatriculacion: '2022-03-15' },
    SIN_IDS_CATALOGO, { hoy: HOY },
  )
  assert.ok(d)
  assert.equal(d.matricula, '1234ABC')
  assert.equal(d.marca, 'TESLA')
  assert.equal(d.modelo, 'Model 3')
  assert.equal(d.version, 'Long Range')
  assert.equal(d.fechaMatriculacion, '2022-03-15')
  assert.equal(d.confirmadoAt, null)
  assert.equal(d.marcaId, null)
  assert.equal(d.kmAnuales, null)
  assert.equal(d.garaje, null)
})

test('lo que no viene queda null: nunca se inventa', () => {
  const d = datosVehiculoDeDocumento({ marca: 'SEAT', modelo: null, version: '   ', matricula: undefined }, SIN_IDS_CATALOGO, { hoy: HOY })
  assert.ok(d)
  assert.equal(d.marca, 'SEAT')
  assert.equal(d.modelo, null)
  assert.equal(d.version, null)
  assert.equal(d.matricula, null)
  assert.equal(d.fechaMatriculacion, null)
})

test('sin nada del vehículo: null (no se escribe un bloque vacío)', () => {
  assert.equal(datosVehiculoDeDocumento({}, SIN_IDS_CATALOGO, { hoy: HOY }), null)
  assert.equal(datosVehiculoDeDocumento({ marca: null, modelo: '' }, IDS, { hoy: HOY }), null)
})

test('ids del catálogo: solo en cascada y con su texto leído', () => {
  const d = datosVehiculoDeDocumento({ marca: 'TESLA', modelo: 'Model 3' }, IDS, { hoy: HOY })
  assert.ok(d)
  assert.deepEqual([d.marcaId, d.modeloId, d.motorId, d.codigoVehiculo], ['731', '8689', 'Electric', '123456'])
  // Sin modelo leído, los ids de modelo/motor/versión no se cuelan.
  const parcial = datosVehiculoDeDocumento({ marca: 'TESLA' }, IDS, { hoy: HOY })
  assert.deepEqual([parcial!.marcaId, parcial!.modeloId, parcial!.motorId, parcial!.codigoVehiculo], ['731', null, null, null])
  // Un id de marca sin marca leída tampoco.
  const sinMarca = datosVehiculoDeDocumento({ modelo: 'Model 3', matricula: '1234ABC' }, IDS, { hoy: HOY })
  assert.equal(sinMarca!.marcaId, null)
  assert.equal(sinMarca!.modeloId, null)
})

test('un campo que no valida se descarta sin tirar el resto', () => {
  const d = datosVehiculoDeDocumento({ marca: 'SEAT', matricula: '1234ABC', fechaMatriculacion: '2030-01-01' }, SIN_IDS_CATALOGO, { hoy: HOY })
  assert.ok(d)
  assert.equal(d.fechaMatriculacion, null)
  assert.equal(d.matricula, '1234ABC')
  assert.equal(d.marca, 'SEAT')
})
