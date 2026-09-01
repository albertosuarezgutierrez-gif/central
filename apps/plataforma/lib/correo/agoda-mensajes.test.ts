import { test } from 'node:test'
import assert from 'node:assert/strict'
import { esAvisoMensajesAgoda, parsearAvisoMensajesAgoda, textoAvisoAgoda } from './agoda-mensajes.ts'

// Copiado LITERAL del correo real de Agoda del 14/04/2026 (hilo 19d8b155af07a86b), incluidos los
// BYTES DE CONTROL que Agoda mete dentro del enlace de tracking (0x15 tras `templateid`, 0x12 tras
// `memberID`). No se reescribe «limpio» a proposito: la regla del repo es que el fixture de un
// parser de documento externo se copia del documento real — el bug clasico es redactarlo con la
// misma suposicion que el codigo y tener la suite en verde sobre un parser que no lee nada.
const CUERPO_REAL = "| [](www.agoda.com) |\n| # Mensajes nuevos de sus huespedes |\n\n| 1 mensajes no leidos atul bhatt y otros huespedes estan intentando comunicarse con usted mediante mensajes a la propiedad! |\n\n| |\n\n| a | |\n| atul bhatt | Apr 14, 04:17 PM |\n\nWe have left the property, there is some food in the fridge that you guys can have, we only bought it yesterday it is very fresh Atul\n\n| Responder a traves de YCS [](https://tracking.agoda.com/click?redirectUrl=https%3A%2F%2Fycs.agoda.com%2Fmldc%2Fen-us%2Fapp%2Fhermes%2Finbox%2Fycs%2F12791421&name=PropertyDailyDigest&abUser=Z&cityID=0&languageid=5&templateid\u0015777&memberIDEncrypt=T0ozeWJmYUZMQ3A2WHFQUHlFSUxLQT09&cid=0&memberID\u001212791421&linkType=button&countryID=0) |\n\n| | |\n| | Descargue la aplicacion de YCS para hoteles hoy mismo! | |"

const CORREO_REAL = {
  from: 'no-reply@agoda.com',
  subject: 'New messages from your guests',
  body: CUERPO_REAL,
}

test('reconoce el aviso real de Agoda', () => {
  assert.equal(esAvisoMensajesAgoda(CORREO_REAL), true)
})

test('extrae huesped, mensaje y piso del correo REAL', () => {
  const a = parsearAvisoMensajesAgoda(CORREO_REAL)!
  assert.equal(a.sinLeer, 1)
  assert.equal(a.huesped, 'atul bhatt')
  assert.match(a.mensaje!, /^We have left the property/)
  assert.match(a.mensaje!, /very fresh Atul$/)
  assert.equal(a.propertyIdAgoda, '12791421')
  assert.equal(a.propertyId, 'prop_luxury_busto', '12791421 es Luxury segun el voucher real')
  assert.match(a.urlYcs!, /ycs\.agoda\.com/)
})

test('un property ID desconocido NO se adivina', () => {
  const otro = { ...CORREO_REAL, body: CORREO_REAL.body.replace('ycs%2F12791421', 'ycs%2F99999999') }
  const a = parsearAvisoMensajesAgoda(otro)!
  assert.equal(a.propertyIdAgoda, '99999999')
  assert.equal(a.propertyId, null, 'mejor sin identificar que atribuirlo al piso equivocado')
})

test('NO secuestra los demas correos de Agoda (vouchers, facturas, OTP)', () => {
  assert.equal(esAvisoMensajesAgoda({ from: 'no-reply@agoda.com', subject: 'Identificador de Reserva de Agoda 1768986884 - CONFIRMADO' }), false)
  assert.equal(esAvisoMensajesAgoda({ from: 'AC-Taxinvoice@agoda.com', subject: 'Commercial Invoice from Agoda [S-ES-26-04-86250]' }), false)
  assert.equal(esAvisoMensajesAgoda({ from: 'no-reply@account.agoda.com', subject: 'One-time passcode for YCS login' }), false)
})

test('ni un correo de OTRO remitente que copie el asunto', () => {
  assert.equal(esAvisoMensajesAgoda({ from: 'phish@no-agoda.example', subject: 'New messages from your guests' }), false)
})

test('el aviso dice por donde se contesta y que Smoobu no vale', () => {
  const t = textoAvisoAgoda(parsearAvisoMensajesAgoda(CORREO_REAL)!, 'Luxury Busto')
  assert.match(t, /atul bhatt/)
  assert.match(t, /food in the fridge/)
  assert.match(t, /NO devuelve las respuestas/)
  assert.match(t, /ycs\.agoda\.com/)
  assert.match(t, /resumen DIARIO/)
})

test('sin texto del mensaje se declara el hueco, no se calla', () => {
  const sinTexto = {
    ...CORREO_REAL,
    body: '| Mensajes nuevos |\n| 2 mensajes no leidos |\n| a | |\n| Maria Lopez | May 02, 09:00 AM |\n| Responder a traves de YCS |',
  }
  const a = parsearAvisoMensajesAgoda(sinTexto)!
  assert.equal(a.huesped, 'Maria Lopez')
  assert.equal(a.mensaje, null)
  assert.match(textoAvisoAgoda(a), /no tra/)
})
