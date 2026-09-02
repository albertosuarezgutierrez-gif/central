import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  botonesReponerVentana, callbackReponerVentana, textoResultadoReponer, MAX_CALLBACK_BYTES,
} from './reponer-ventana-puro.ts'
import { parseCallback } from '@central/core-telegram'
import type { Desajuste } from './acceso-programador.ts'

const DISP = '3f1c2b9a-7d4e-4c8b-9a1f-2e6d5c4b3a21'

function desajuste(over: Partial<Desajuste> = {}): Desajuste {
  return {
    reservaRef: '152490601', propertyId: 'prop_house_sevillana', guestName: 'Raquel Rocamora Mateo',
    actual: { desdeEpoch: 1, hastaEpoch: 2 }, debida: { desdeEpoch: 1, hastaEpoch: 3 },
    entradaMin: 0, salidaMin: 120, entregado: true, ...over,
  }
}

test('callback: cabe en los 64 bytes de Telegram y parseCallback lo devuelve entero', () => {
  const cb = callbackReponerVentana(DISP, '152490601')
  assert.ok(Buffer.byteLength(cb) <= MAX_CALLBACK_BYTES, `${Buffer.byteLength(cb)} bytes`)
  const p = parseCallback(cb)
  assert.equal(p.prefix, 'dom')
  assert.equal(p.action, 'ventana')
  assert.deepEqual(p.args, [DISP, '152490601'])
})

test('botones: un botón por PIN, en filas de uno, con el nombre del huésped', () => {
  const filas = botonesReponerVentana(DISP, [desajuste(), desajuste({ reservaRef: '150885616', guestName: 'Cristina Lara García' })])
  assert.equal(filas.length, 2)
  assert.equal(filas[0].length, 1)
  assert.match(filas[0][0].texto, /152490601/)
  assert.match(filas[0][0].texto, /Raquel/)
  assert.equal(filas[1][0].callback, callbackReponerVentana(DISP, '150885616'))
})

test('botones: una ref con ":" (PIN manual) o que no quepa en 64 bytes se queda SIN botón, no con uno roto', () => {
  const filas = botonesReponerVentana(DISP, [
    desajuste({ reservaRef: 'manual:abc' }),
    desajuste({ reservaRef: '9'.repeat(40) }),
    desajuste({ reservaRef: '150885616' }),
  ])
  assert.equal(filas.length, 1)
  assert.match(filas[0][0].callback!, /150885616$/)
})

test('texto: el código que CAMBIÓ se canta, el que sigue igual se confirma, el sinCambio no asusta', () => {
  const base = { ok: true as const, pin: '482913', modo: 'online', desde: '2026-09-04T13:00:00.000Z', hasta: '2026-09-06T11:00:00.000Z' }
  assert.match(textoResultadoReponer('1', { ...base, pinCambio: false }), /^✅ .*sigue siendo 482913/)
  assert.match(textoResultadoReponer('1', { ...base, pinCambio: false }), /del 04\/09 15:00 al 06\/09 13:00/)
  assert.match(textoResultadoReponer('1', { ...base, pinCambio: true }), /^⚠️ .*CAMBIÓ a 482913.*mándale el nuevo/)
  assert.match(textoResultadoReponer('1', { ok: true, sinCambio: true, pin: '1' }), /ya era la correcta/)
  assert.match(textoResultadoReponer('1', { ok: false, status: 502, error: 'Smoobu caído' }), /^❌ Reserva 1: Smoobu caído/)
})
