// packages/module-seguros/src/renovacion-contacto.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { COOLDOWN_RENOVACION_DIAS, enCooldownRenovacion, textoAvisoRenovacionWhatsapp } from './renovacion-contacto.ts'

test('sin contacto previo, nunca está en cooldown', () => {
  assert.equal(enCooldownRenovacion(null), false)
})

test('un contacto de ayer sigue en cooldown', () => {
  const ayer = new Date('2026-09-20T10:00:00Z')
  const hoy = new Date('2026-09-21T10:00:00Z')
  assert.equal(enCooldownRenovacion({ creadoAt: ayer }, hoy), true)
})

test('un contacto de hace 15 días ya no está en cooldown (14 días)', () => {
  const hace15 = new Date('2026-09-06T10:00:00Z')
  const hoy = new Date('2026-09-21T10:00:00Z')
  assert.equal(enCooldownRenovacion({ creadoAt: hace15 }, hoy, COOLDOWN_RENOVACION_DIAS), false)
})

test('el mensaje nombra el ramo, la compañía ACTUAL y la fecha en formato español', () => {
  const t = textoAvisoRenovacionWhatsapp({
    nombre: 'Jose Suarez Salas',
    ramoLegible: 'auto',
    aseguradora: 'Mapfre',
    fechaVencimiento: '2026-11-15',
  })
  assert.match(t, /Jose/i)
  assert.match(t, /auto/i)
  assert.match(t, /Mapfre/)
  assert.match(t, /15\/11\/2026/)
})

test('siempre deja abierta la puerta a que no haga falta insistir', () => {
  const t = textoAvisoRenovacionWhatsapp({
    nombre: 'Ana', ramoLegible: 'hogar', aseguradora: 'Allianz', fechaVencimiento: '2026-12-01',
  })
  assert.match(t, /no insisto/i)
})
