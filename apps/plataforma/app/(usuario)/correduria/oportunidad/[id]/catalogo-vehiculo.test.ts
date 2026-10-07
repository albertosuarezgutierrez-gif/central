import test from 'node:test'
import assert from 'node:assert/strict'
import { MOTORES_MOTO, motivoSinPrecio, paramsVersiones, payloadVersion, ramoCatalogo, seleccionDeVersion, tipoGaraje, tiposCatalogo } from './catalogo-vehiculo.ts'

const marcas = [{ id: 'm1', nombre: 'Yamaha' }, { id: 'm2', nombre: 'Honda' }]
const modelos = [{ id: 'mo1', nombre: 'MT-07' }]
const versiones = [{ id: 'v1', nombre: '689 ABS 74kW' }, { id: 'v2', nombre: '689 ABS 35kW' }]

test('sufijo -moto según ramo, incluido el garaje', () => {
  assert.deepEqual(tiposCatalogo('moto'), { marcas: 'marcas-moto', modelos: 'modelos-moto', versiones: 'versiones-moto', garajes: 'garajes-moto' })
  assert.deepEqual(tiposCatalogo('auto'), { marcas: 'marcas', modelos: 'modelos', versiones: 'versiones', garajes: 'garajes' })
  assert.equal(tipoGaraje('moto'), 'garajes-moto')
  assert.equal(tipoGaraje('auto'), 'garajes')
  assert.equal(ramoCatalogo('hogar'), null)
  assert.deepEqual(paramsVersiones('moto', 'm1', 'mo1', 'Gasoline'), { tipo: 'versiones-moto', marcaId: 'm1', modeloId: 'mo1', motor: 'Gasoline' })
  assert.deepEqual(MOTORES_MOTO.map((m) => m.id), ['Gasoline', 'Diesel', 'Others'])
})

test('elegir versión → payload con los 7 campos, con los nombres del catálogo', () => {
  const s = seleccionDeVersion({ marcas, modelos, versiones, marcaId: 'm1', modeloId: 'mo1', motorId: 'Gasoline', codigoVehiculo: 'v2' })
  assert.ok(s)
  const p = payloadVersion(s)
  assert.deepEqual(p, {
    marca: 'Yamaha', modelo: 'MT-07', version: '689 ABS 35kW',
    codigoVehiculo: 'v2', marcaId: 'm1', modeloId: 'mo1', motorId: 'Gasoline',
  })
  assert.equal(Object.keys(p).length, 7)
})

test('cascada incompleta o id fuera del catálogo → null (nunca un payload a medias)', () => {
  const base = { marcas, modelos, versiones, marcaId: 'm1', modeloId: 'mo1', motorId: 'Gasoline', codigoVehiculo: 'v1' }
  assert.ok(seleccionDeVersion(base))
  assert.equal(seleccionDeVersion({ ...base, motorId: '' }), null)
  assert.equal(seleccionDeVersion({ ...base, codigoVehiculo: 'zz' }), null)
  assert.equal(seleccionDeVersion({ ...base, marcaId: 'zz' }), null)
  assert.equal(seleccionDeVersion({ ...base, modeloId: 'zz' }), null)
})

test('Pedir precio: motivo si falta algo; sin motivo = solo navega', () => {
  const ok = { codigoVehiculo: 'v1', matricula: '1234ABC', fechaMatriculacion: null }
  const libre = { editando: false, eligiendo: false, ocupado: false, ramoCotizable: true }
  assert.equal(motivoSinPrecio(ok, libre), null)
  assert.equal(motivoSinPrecio({ ...ok, matricula: null, fechaMatriculacion: '2024-01-01' }, libre), null)
  assert.match(motivoSinPrecio({ ...ok, codigoVehiculo: null }, libre) ?? '', /versión del catálogo/)
  assert.match(motivoSinPrecio({ ...ok, matricula: null }, libre) ?? '', /matrícula o la fecha/)
  assert.match(motivoSinPrecio(ok, { ...libre, editando: true }) ?? '', /Termina de editar/)
  assert.match(motivoSinPrecio(ok, { ...libre, eligiendo: true }) ?? '', /Termina de editar/)
  assert.ok(motivoSinPrecio(ok, { ...libre, ocupado: true }))
  assert.ok(motivoSinPrecio(ok, { ...libre, ramoCotizable: false }))
})
