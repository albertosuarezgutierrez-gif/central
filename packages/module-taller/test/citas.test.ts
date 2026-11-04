import { test } from 'node:test'
import assert from 'node:assert/strict'
import { caducidadInvitacion, configDeAlta, estadoInvitacion, esCorreo, invitacionAbierta, normalizarMovil, validarMatricula } from '../src/index.ts'
import { masDias, hoy } from './_util.ts'

test('invitación: vigente, usada, caducada y revocada (una usada o caducada no abre nada)', () => {
  const ahora = hoy()
  const base = { caducaEn: masDias(ahora, 3), usadaEn: null, revocadaEn: null }
  assert.equal(estadoInvitacion(base, ahora), 'vigente')
  assert.equal(invitacionAbierta(base, ahora), true)
  assert.equal(estadoInvitacion({ ...base, usadaEn: ahora }, ahora), 'usada')
  assert.equal(estadoInvitacion({ ...base, caducaEn: ahora }, ahora), 'caducada', 'caduca justo en la fecha')
  assert.equal(estadoInvitacion({ ...base, caducaEn: masDias(ahora, -1) }, ahora), 'caducada')
  assert.equal(estadoInvitacion({ ...base, revocadaEn: ahora }, ahora), 'revocada')
  for (const e of [{ ...base, usadaEn: ahora }, { ...base, caducaEn: masDias(ahora, -1) }, { ...base, revocadaEn: ahora }]) assert.equal(invitacionAbierta(e, ahora), false)
})

test('la caducidad sale de la configuración (N días del taller)', () => {
  const c = configDeAlta()
  const ahora = hoy()
  c.agenda.invitacionCaducaDias = 3
  assert.equal(caducidadInvitacion(c, ahora).getTime(), masDias(ahora, 3).getTime())
})

test('matrícula: se normaliza y se corta lo evidentemente inválido', () => {
  assert.deepEqual(validarMatricula('1234 bcd'), { ok: true, normalizada: '1234BCD' })
  assert.deepEqual(validarMatricula('se-1234-ab'), { ok: true, normalizada: 'SE1234AB' })
  for (const mala of ['', '1234', 'ABCDEFG', '12345678901', '<script>', '--']) assert.equal(validarMatricula(mala).ok, false, mala)
})

test('correo y móvil', () => {
  assert.equal(esCorreo('a@b.es'), true)
  assert.equal(esCorreo('a@b'), false)
  assert.equal(normalizarMovil('+34 600 11 22 33'), '600112233')
  assert.equal(normalizarMovil('12345'), null)
})
