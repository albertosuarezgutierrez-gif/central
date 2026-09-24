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

// ── 🚨 Recibos de aseguradora ───────────────────────────────────────────────
// Asuntos REALES de la bandeja de Alberto (medidos el 03/09/2026 sobre correo_triaje).

test('🚨 un aviso de recibos de una aseguradora NO se queda en el digest', () => {
  const casos: [string, string][] = [
    ['mediadores@occidentinforma.com', 'Recibos devueltos de banco 14-08-2026'],
    ['mediadores@occidentinforma.com', 'Resumen de recibos anulados por impago 00306333 (31.07.2026)'],
    ['mediadores@occidentinforma.com', 'Resumen de recibos próximos a la anulación 00306333 (22.07.2026)'],
    ['mediador@allianz.es', 'Relacion anulacion polizas por impago'],
    ['dmapcccrecibosoperac@mapfre.com', 'DELEGACIÓN RECIBO Nº 8788253709 PÓLIZA MAPFRE'],
  ]
  for (const [from, subject] of casos) {
    assert.equal(clasificarPorKeyword(from, subject)?.categoria, 'correduria-recibo', subject)
  }
})

test('la anulación cuenta con tilde y sin ella: las compañías escriben las dos', () => {
  assert.equal(clasificarPorKeyword('mediadores@occidentinforma.com', 'próximos a la anulación')?.categoria, 'correduria-recibo')
  assert.equal(clasificarPorKeyword('mediadores@occidentinforma.com', 'proximos a la anulacion')?.categoria, 'correduria-recibo')
})

test('🚨 hacen falta las DOS condiciones: aseguradora Y asunto de recibo', () => {
  // Un recibo de un proveedor NO es un recibo de la cartera: sigue siendo contabilidad.
  assert.equal(clasificarPorKeyword('servicio@paypal.es', 'Recibo de su pago a IONOS')?.categoria, 'contabilidad')
  // Y un comunicado comercial de una aseguradora sigue siendo correduría de digest.
  assert.equal(clasificarPorKeyword('ccorredor@mapfre.com', 'Nueva oferta Mapfre para colectivos de Salud')?.categoria ?? null, null)
  assert.equal(clasificarPorKeyword('mediadores@occidentinforma.com', 'Siniestro Diversos 42892775')?.categoria, 'correduria')
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
