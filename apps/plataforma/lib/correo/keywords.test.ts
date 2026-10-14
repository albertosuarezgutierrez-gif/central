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
    ['dmapcccrecibosoperac@mapfre.com', 'DELEGACIÓN RECIBO Nº 8700000036 PÓLIZA MAPFRE'],
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
  assert.equal(clasificarPorKeyword('mediadores@occidentinforma.com', 'Siniestro Diversos 42000037')?.categoria, 'correduria')
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

// ── Avisos operativos de compañía y Codeoscopic (14/10/2026) ───────────────
test('aviso legítimo de info.mapfre.com → correduria (recibo si el asunto es de recibo)', () => {
  assert.equal(clasificarPorKeyword('avisosrecibos@info.mapfre.com', 'Aviso de recibo pendiente')?.categoria, 'correduria-recibo')
  assert.equal(clasificarPorKeyword('avisosrecibos@info.mapfre.com', 'Información de su póliza')?.categoria, 'correduria')
  assert.equal(clasificarPorKeyword('enviodocumentacionpoliza@info.mapfre.com', 'Su documentación')?.categoria, 'correduria')
})

test('publicidad mapfretecuidamos → ruido', () => {
  assert.equal(clasificarPorKeyword('mapfretecuidamos@info.mapfre.com', 'Cuida tu salud este otoño')?.categoria, 'ruido')
})

test('avisos operativos por asunto (MAO, ticket, fichero, desbloqueo) → correduria', () => {
  assert.equal(clasificarPorKeyword('soporte@mapfre.com', 'Cierre de MAO desktop')?.categoria, 'correduria')
  assert.equal(clasificarPorKeyword('soporte@occident.com', 'Ticket Cerrado 12345')?.categoria, 'correduria')
  assert.equal(clasificarPorKeyword('ficheros@reale.es', 'Movimientos a Fichero')?.categoria, 'correduria')
  assert.equal(clasificarPorKeyword('mediador@allianz.es', 'Solicitud de desbloqueo de póliza')?.categoria, 'correduria')
})

test('Codeoscopic: operativo → correduria, newsletter → ruido', () => {
  assert.equal(clasificarPorKeyword('soporte@codeoscopic.com', 'Incidencia resuelta en su ERP')?.categoria, 'correduria')
  assert.equal(clasificarPorKeyword('newsletter@codeoscopic.com', 'Novedades')?.categoria, 'ruido')
  assert.equal(clasificarPorKeyword('equipo@codeoscopic.com', 'Webinar: nueva versión')?.categoria, 'ruido')
})

test('Codeoscopic: sus FACTURAS no son correduría operativa → decide la IA (como antes de la regla)', () => {
  assert.equal(clasificarPorKeyword('facturacion@codeoscopic.com', 'Su factura de octubre'), null)
  assert.equal(clasificarPorKeyword('facturas@codeoscopic.com', 'Documento 2026-123'), null)
  assert.equal(clasificarPorKeyword('soporte@codeoscopic.com', 'Factura 2026-123 disponible'), null)
  // «invoice» sigue la regla genérica de asunto de siempre (contabilidad), nunca correduría.
  assert.notEqual(clasificarPorKeyword('billing@codeoscopic.com', 'Your invoice is ready')?.categoria, 'correduria')
})

test('nuevas aseguradoras: recibo devuelto → correduria-recibo', () => {
  for (const d of ['helvetia.es', 'santalucia.es', 'pelayo.com', 'segurcaixaadeslas.es', 'fiatc.es', 'mapfre.es']) {
    assert.equal(clasificarPorKeyword(`mediadores@${d}`, 'Recibos devueltos de banco')?.categoria, 'correduria-recibo', d)
  }
})

test('🚨 venta directa / salud NO son aseguradora de la correduría: pueden ser pólizas PERSONALES de Alberto', () => {
  // Un «recibo devuelto» de Sanitas o Línea Directa puede ser el seguro de Alberto, no de un cliente:
  // no se manda a correduría ni a la cartera; decide la IA.
  for (const d of ['sanitas.es', 'dkv.es', 'asisa.es', 'verti.es', 'lineadirecta.es', 'mutua.es', 'mutuamadrilena.es']) {
    assert.equal(clasificarPorKeyword(`clientes@${d}`, 'Recibos devueltos de banco'), null, d)
    assert.equal(clasificarPorKeyword(`avisos@${d}`, 'Siniestro 123456: documentación'), null, d)
  }
})

test('comunicado comercial de compañía NO se vuelve operativo', () => {
  assert.equal(clasificarPorKeyword('ccorredor@mapfre.com', 'Campaña de otoño para mediadores')?.categoria ?? null, null)
})
