// Tests de la capa keyword del triaje. Runner: `node --test` (type-stripping).
// Casos tomados de producción (correos que caían a 'dudoso' cuando la IA se saturaba).
import { test } from 'node:test'
import assert from 'node:assert/strict'

import { clasificarPorKeyword } from './keywords.ts'

test('procesadores de pago → contabilidad (por dominio)', () => {
  assert.equal(clasificarPorKeyword('invoice+statements+acct_x@stripe.com', 'Your receipt from Anthropic')?.categoria, 'contabilidad')
  assert.equal(clasificarPorKeyword('servicio@paypal.es', 'Recibo de su pago a IONOS')?.categoria, 'contabilidad')
  assert.equal(clasificarPorKeyword('donotreply@interactivebrokers.com', 'Extracto de actividad diaria')?.categoria, 'contabilidad')
})

test('plataformas de reserva → huespedes (incluye subdominios)', () => {
  assert.equal(clasificarPorKeyword('5909240495-xx@guest.booking.com', 'Hemos recibido este mensaje de Julien')?.categoria, 'huespedes')
  assert.equal(clasificarPorKeyword('service@smoobu.com', 'Nueva reserva para Busto Reform')?.categoria, 'huespedes')
  assert.equal(clasificarPorKeyword('notifications@info.homeexchange.com', 'Fabio ha añadido tu casa')?.categoria, 'huespedes')
})

test('aseguradora Occident → correduria; mediadores@ por prefijo', () => {
  assert.equal(clasificarPorKeyword('mediadores@occidentinforma.com', 'Siniestro Diversos')?.categoria, 'correduria')
  assert.equal(clasificarPorKeyword('comunicacion.mediadores@allianz.es', 'Plan de Protección')?.categoria, 'correduria')
})

test('marketing masivo conocido → ruido', () => {
  assert.equal(clasificarPorKeyword('comunicaciones@comunica.endesaclientes.com', 'Gana un iPhone 17 Pro')?.categoria, 'ruido')
  assert.equal(clasificarPorKeyword('noresponder@club.cortefiel.com', 'ALBERTO, no compartas el secreto')?.categoria, 'ruido')
})

test('asunto transaccional rescata aunque el dominio no esté en la lista', () => {
  assert.equal(clasificarPorKeyword('billing@fal.ai', 'Invoice #123 for your usage')?.categoria, 'contabilidad')
})

test('nunca infiere seguridad ni personal por keyword', () => {
  const r = clasificarPorKeyword('alertas@banco-falso.com', 'Verifique su cuenta o será bloqueada')
  assert.notEqual(r?.categoria, 'seguridad-sospechosa')
})

test('sin señal clara → null (decide la IA)', () => {
  assert.equal(clasificarPorKeyword('gabriel@cortijoeltoril.com', 'Consulta general'), null)
  assert.equal(clasificarPorKeyword('', ''), null)
})
