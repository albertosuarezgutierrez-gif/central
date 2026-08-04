import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  madridOffsetMin, madridEpoch, ventanaPin, reconciliar, necesitaAvisoOffline,
  type ReservaAcceso, type PinExistente, type CfgProgramador,
} from './acceso-programador.ts'

const CFG: CfgProgramador = { autoPin: true, margenEntradaMin: 0, margenSalidaMin: 0, autoBorrarTrasCheckout: true }

function reserva(over: Partial<ReservaAcceso> = {}): ReservaAcceso {
  return {
    id: '111', propertyId: 'prop_house_sevillana', smoobuApartmentId: 42,
    arrival: '2026-07-10', departure: '2026-07-12', checkIn: '15:00', checkOut: '11:00', ...over,
  }
}

test('madridOffsetMin: verano +120, invierno +60', () => {
  assert.equal(madridOffsetMin(Date.UTC(2026, 6, 10, 12, 0)), 120) // julio (CEST)
  assert.equal(madridOffsetMin(Date.UTC(2026, 0, 10, 12, 0)), 60)  // enero (CET)
})

test('madridEpoch: 15:00 Madrid en verano = 13:00 UTC', () => {
  const e = madridEpoch('2026-07-10', '15:00')
  assert.equal(new Date(e * 1000).toISOString(), '2026-07-10T13:00:00.000Z')
})

test('madridEpoch: 11:00 Madrid en invierno = 10:00 UTC', () => {
  const e = madridEpoch('2026-01-10', '11:00')
  assert.equal(new Date(e * 1000).toISOString(), '2026-01-10T10:00:00.000Z')
})

test('ventanaPin: sin márgenes = check-in..check-out reales', () => {
  const { desdeEpoch, hastaEpoch } = ventanaPin(reserva(), CFG)
  assert.equal(new Date(desdeEpoch * 1000).toISOString(), '2026-07-10T13:00:00.000Z') // 15:00 CEST
  assert.equal(new Date(hastaEpoch * 1000).toISOString(), '2026-07-12T09:00:00.000Z') // 11:00 CEST
})

test('ventanaPin: márgenes ensanchan la ventana', () => {
  const cfg = { ...CFG, margenEntradaMin: 30, margenSalidaMin: 60 }
  const { desdeEpoch, hastaEpoch } = ventanaPin(reserva(), cfg)
  assert.equal(new Date(desdeEpoch * 1000).toISOString(), '2026-07-10T12:30:00.000Z') // 30 min antes
  assert.equal(new Date(hastaEpoch * 1000).toISOString(), '2026-07-12T10:00:00.000Z') // 60 min después
})

test('reconciliar: crea PIN para reserva sin PIN vivo', () => {
  const { crear, borrar } = reconciliar([reserva()], CFG, [], 0)
  assert.equal(crear.length, 1)
  assert.equal(crear[0].id, '111')
  assert.equal(borrar.length, 0)
})

test('reconciliar: idempotente — no recrea si ya hay PIN activo', () => {
  const ex: PinExistente[] = [{ reservaRef: '111', estado: 'activo', validoHastaEpoch: 9e9, tuyaPasswordId: 'p1' }]
  const { crear } = reconciliar([reserva()], CFG, ex, 0)
  assert.equal(crear.length, 0)
})

test('reconciliar: autoPin off ⇒ no crea nada', () => {
  const { crear } = reconciliar([reserva()], { ...CFG, autoPin: false }, [], 0)
  assert.equal(crear.length, 0)
})

test('reconciliar: borra PIN activo ya vencido si autoBorrarTrasCheckout', () => {
  const ahora = 1_000_000
  const ex: PinExistente[] = [{ reservaRef: '111', estado: 'activo', validoHastaEpoch: ahora - 10, tuyaPasswordId: 'p1' }]
  const { borrar } = reconciliar([], CFG, ex, ahora)
  assert.equal(borrar.length, 1)
  assert.equal(borrar[0].reservaRef, '111')
})

test('reconciliar: NO borra si autoBorrarTrasCheckout=false', () => {
  const ahora = 1_000_000
  const ex: PinExistente[] = [{ reservaRef: '111', estado: 'activo', validoHastaEpoch: ahora - 10, tuyaPasswordId: 'p1' }]
  const { borrar } = reconciliar([], { ...CFG, autoBorrarTrasCheckout: false }, ex, ahora)
  assert.equal(borrar.length, 0)
})

test('reconciliar: PIN vencido pero aún en el futuro NO se borra', () => {
  const ahora = 1_000_000
  const ex: PinExistente[] = [{ reservaRef: '111', estado: 'activo', validoHastaEpoch: ahora + 3600, tuyaPasswordId: 'p1' }]
  const { borrar } = reconciliar([], CFG, ex, ahora)
  assert.equal(borrar.length, 0)
})

test('necesitaAvisoOffline: offline + check-in dentro del lead ⇒ avisar', () => {
  const ahora = 1_000_000
  assert.equal(necesitaAvisoOffline(false, ahora + 6 * 3600, ahora, 12), true)
})

test('necesitaAvisoOffline: online ⇒ nunca avisa', () => {
  const ahora = 1_000_000
  assert.equal(necesitaAvisoOffline(true, ahora + 3600, ahora, 12), false)
})

test('necesitaAvisoOffline: check-in fuera del lead ⇒ no avisa', () => {
  const ahora = 1_000_000
  assert.equal(necesitaAvisoOffline(false, ahora + 48 * 3600, ahora, 12), false)
})

test('necesitaAvisoOffline: sin check-in próximo ⇒ no avisa', () => {
  assert.equal(necesitaAvisoOffline(false, null, 1_000_000, 12), false)
})
