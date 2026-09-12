// packages/module-seguros/src/recaptacion.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { COOLDOWN_DIAS, enCooldown, textoBaseRecaptacionWhatsapp } from './recaptacion.ts'

test('sin envío previo, nunca está en cooldown', () => {
  assert.equal(enCooldown(null), false)
})

test('un envío de ayer sigue en cooldown', () => {
  const ayer = new Date('2026-09-11T10:00:00Z')
  const hoy = new Date('2026-09-12T10:00:00Z')
  assert.equal(enCooldown({ creadoAt: ayer }, hoy), true)
})

test('un envío de hace 15 días ya no está en cooldown (14 días)', () => {
  const hace15 = new Date('2026-08-28T10:00:00Z')
  const hoy = new Date('2026-09-12T10:00:00Z')
  assert.equal(enCooldown({ creadoAt: hace15 }, hoy, COOLDOWN_DIAS), false)
})

test('exactamente en el límite del cooldown sigue contando como en cooldown', () => {
  const hace14 = new Date('2026-08-29T10:00:00Z')
  const hoy = new Date('2026-09-12T10:00:00Z')
  assert.equal(enCooldown({ creadoAt: hace14 }, hoy, COOLDOWN_DIAS), true)
})

test('el mensaje base nombra el ramo y, si se conoce, la aseguradora anterior', () => {
  const t = textoBaseRecaptacionWhatsapp({
    nombre: 'Maria Antonia Gutierrez Alcala',
    ramoLegible: 'comunidades',
    aseguradoraAnterior: 'Plus Ultra',
  })
  assert.match(t, /Maria/i)
  assert.match(t, /comunidades/i)
  assert.match(t, /Plus Ultra/)
})

test('sin aseguradora anterior conocida, no se inventa ninguna', () => {
  const t = textoBaseRecaptacionWhatsapp({ nombre: 'Pablo', ramoLegible: 'auto', aseguradoraAnterior: null })
  assert.doesNotMatch(t, /con null/i)
})
