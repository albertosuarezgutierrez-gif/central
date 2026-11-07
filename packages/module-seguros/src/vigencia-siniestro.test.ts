import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  vigenciaSiniestro,
  leerVigenciaSiniestro,
} from './vigencia-siniestro.ts'

const HOY = new Date('2026-11-07T12:00:00Z')
const haceDias = (n: number) => new Date(HOY.getTime() - n * 86_400_000)
const iso = (n: number) => haceDias(n).toISOString().slice(0, 10)

test('asistencia (grupo 11) a 61 días sin movimiento → sin_confirmar', () => {
  assert.equal(vigenciaSiniestro({ estado: 'abierto', tipo: '1102', origen: 'cima', fechaHora: haceDias(61) }, HOY), 'sin_confirmar')
})

test('asistencia a 59 días → abierto', () => {
  assert.equal(vigenciaSiniestro({ estado: 'abierto', tipo: '1104', origen: 'cima', fechaHora: haceDias(59) }, HOY), 'abierto')
})

test('otro tipo a 61 días → abierto', () => {
  assert.equal(vigenciaSiniestro({ estado: 'abierto', tipo: '0301', origen: 'cima', fechaHora: haceDias(61) }, HOY), 'abierto')
})

test('181 días → sin_confirmar; 179 → abierto', () => {
  assert.equal(vigenciaSiniestro({ estado: 'en_tramitacion', tipo: '0301', origen: 'cima', fechaHora: haceDias(181) }, HOY), 'sin_confirmar')
  assert.equal(vigenciaSiniestro({ estado: 'en_tramitacion', tipo: '0301', origen: 'cima', fechaHora: haceDias(179) }, HOY), 'abierto')
})

test('a mano (gestionado_correduria) a 400 días → abierto', () => {
  assert.equal(vigenciaSiniestro({ estado: 'abierto', tipo: '1102', origen: 'gestionado_correduria', fechaHora: haceDias(400) }, HOY), 'abierto')
})

test('cerrado y rechazado → cerrado, aunque sean recientes o a mano', () => {
  assert.equal(vigenciaSiniestro({ estado: 'cerrado', origen: 'cima', fechaHora: haceDias(1) }, HOY), 'cerrado')
  assert.equal(vigenciaSiniestro({ estado: 'rechazado', origen: 'gestionado_correduria' }, HOY), 'cerrado')
})

test('sin fechas → sin_confirmar (nunca abierto ni cerrado inventado)', () => {
  assert.equal(vigenciaSiniestro({ estado: 'abierto', origen: 'cima' }, HOY), 'sin_confirmar')
})

test('un movimiento reciente en situaciones/acciones/pagos/declaración rescata un hecho antiguo', () => {
  const viejo = haceDias(500)
  assert.equal(vigenciaSiniestro({ estado: 'abierto', origen: 'cima', fechaHora: viejo, situacionesCima: [{ fecha: iso(10), codigo: 'X' }] }, HOY), 'abierto')
  assert.equal(vigenciaSiniestro({ estado: 'abierto', origen: 'cima', fechaHora: viejo, accionesCima: [{ fecha: iso(20) }] }, HOY), 'abierto')
  assert.equal(vigenciaSiniestro({ estado: 'abierto', origen: 'cima', fechaHora: viejo, pagosCima: [{ fecha: iso(30) }] }, HOY), 'abierto')
  assert.equal(vigenciaSiniestro({ estado: 'abierto', origen: 'cima', fechaHora: viejo, fechaDeclaracion: iso(40) }, HOY), 'abierto')
})

test('estado fuera de vocabulario no se promociona a abierto', () => {
  assert.equal(vigenciaSiniestro({ estado: 'raro', origen: 'cima', fechaHora: haceDias(1) }, HOY), 'sin_confirmar')
})

test('leerVigenciaSiniestro: valor del puerto o, si falta, derivado de abierto', () => {
  assert.equal(leerVigenciaSiniestro('sin_confirmar', true), 'sin_confirmar')
  assert.equal(leerVigenciaSiniestro(undefined, true), 'abierto')
  assert.equal(leerVigenciaSiniestro(undefined, false), 'cerrado')
})
