import test from 'node:test'
import assert from 'node:assert/strict'
import { planPrecargaVehiculo, previoPuedeMandar, sigueSinConfirmar } from './precarga-vehiculo.ts'
import { datosVehiculoVacios, type DatosVehiculoRiesgo } from '@central/module-seguros'

const d = (o: Partial<DatosVehiculoRiesgo> = {}): DatosVehiculoRiesgo => ({ ...datosVehiculoVacios(), ...o })

test('sin riesgo: nada que precargar', () => {
  const p = planPrecargaVehiculo(null, false)
  assert.equal(p.cascada, null)
  assert.equal(p.completa, false)
  assert.equal(p.fechaMatriculacion, null)
})

test('cascada completa: los cuatro ids, y manda el riesgo', () => {
  const p = planPrecargaVehiculo(d({ marcaId: '1', modeloId: '2', motorId: 'Diesel', codigoVehiculo: '3', fechaMatriculacion: '2020-01-02' }), false)
  assert.deepEqual(p.cascada, { marcaId: '1', modeloId: '2', motorId: 'Diesel', codigoVehiculo: '3' })
  assert.equal(p.completa, true)
  assert.equal(p.fechaMatriculacion, '2020-01-02')
})

test('parcial: solo marca; solo marca+modelo; el motor sin modelo no se precarga', () => {
  assert.deepEqual(planPrecargaVehiculo(d({ marcaId: '1' }), false).cascada, { marcaId: '1' })
  assert.deepEqual(planPrecargaVehiculo(d({ marcaId: '1', modeloId: '2' }), false).cascada, { marcaId: '1', modeloId: '2' })
  assert.deepEqual(planPrecargaVehiculo(d({ marcaId: '1', motorId: 'Diesel', codigoVehiculo: '3' }), false).cascada, { marcaId: '1' })
  assert.equal(planPrecargaVehiculo(d({ marcaId: '1', modeloId: '2' }), false).completa, false)
  // Ids sin marcaId: nada que cargar (la cascada cuelga de la marca).
  assert.equal(planPrecargaVehiculo(d({ modeloId: '2', motorId: 'Diesel' }), false).cascada, null)
})

test('marca en texto sin id: pista del buscador, no selección', () => {
  const p = planPrecargaVehiculo(d({ marca: 'TESLA', modelo: 'Model 3', version: 'Long Range' }), false)
  assert.equal(p.cascada, null)
  assert.equal(p.pistaMarca, 'TESLA')
  assert.equal(p.pistaModelo, 'Model 3')
  assert.equal(p.pistaVersion, 'Long Range')
  // Con id, el texto ya no hace falta como pista.
  const q = planPrecargaVehiculo(d({ marca: 'TESLA', marcaId: '731', modelo: 'Model 3' }), false)
  assert.equal(q.pistaMarca, null)
  assert.equal(q.pistaModelo, 'Model 3')
})

test('variante retomada: manda sobre todo, el riesgo no precarga nada', () => {
  const p = planPrecargaVehiculo(d({ marcaId: '1', marca: 'X', fechaMatriculacion: '2020-01-02' }), true)
  assert.equal(p.cascada, null)
  assert.equal(p.completa, false)
  assert.equal(p.pistaMarca, null)
  assert.equal(p.fechaMatriculacion, null)
})

test('sin confirmar: solo mientras no haya sello y el valor siga siendo el precargado', () => {
  const sin = planPrecargaVehiculo(d({ marcaId: '1' }), false)
  assert.equal(sin.sinConfirmar, true)
  assert.equal(sigueSinConfirmar(sin, '1', '1'), true)
  assert.equal(sigueSinConfirmar(sin, '1', '9'), false)
  assert.equal(sigueSinConfirmar(sin, null, ''), false)
  const conf = planPrecargaVehiculo(d({ marcaId: '1', confirmadoAt: '2026-10-01T10:00:00Z' }), false)
  assert.equal(conf.sinConfirmar, false)
  assert.equal(sigueSinConfirmar(conf, '1', '1'), false)
})

test('previoPuedeMandar: la anterior manda salvo que el riesgo traiga otra moto', () => {
  assert.equal(previoPuedeMandar(null, 'A', false), true)
  assert.equal(previoPuedeMandar(d(), 'A', false), true)
  assert.equal(previoPuedeMandar(d({ codigoVehiculo: 'A', marcaId: '1' }), 'A', false), true)
  assert.equal(previoPuedeMandar(d({ codigoVehiculo: 'B', marcaId: '1' }), 'A', false), false)
  assert.equal(previoPuedeMandar(d({ codigoVehiculo: 'B' }), null, false), false)
  // sin código pero con marca/modelo (ids o texto): no se puede probar que sea la misma → no manda
  assert.equal(previoPuedeMandar(d({ marca: 'Yamaha', modelo: 'MT-07' }), 'A', false), false)
  assert.equal(previoPuedeMandar(d({ marcaId: '3', modeloId: '4' }), 'A', false), false)
  // variante retomada: lo pagado manda siempre
  assert.equal(previoPuedeMandar(d({ codigoVehiculo: 'B' }), 'A', true), true)
})
