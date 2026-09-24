import { test } from 'node:test'
import assert from 'node:assert/strict'
import { esRemitenteDeCanal, extraerNumConfirmacionDe } from './num-confirmacion.ts'

// Fixture LITERAL del correo REAL que disparó el 🚨 falso del 04/09/2026 (hilo 1a06e22243ed2fe0):
// el 360009410197 del aviso es el id de un artículo del Zendesk de HomeExchange dentro de un
// enlace. La regla del repo: el fixture de un parser sale del documento real, no de lo que uno
// cree que dice.
const HOMEEXCHANGE = {
  from: 'notifications@info.homeexchange.com',
  subject: 'RE: Irene et Rico ha contestado a tu mensaje',
  body: `Aquí está el mensaje de Irene et Rico:\n\n¡Lo siento! Hemos estado intentando mirar billetes para ir, pero los precios se han disparado desde la última vez que lo miramos.\n\nResponder a Irene et Rico\n<https://www.homeexchange.com/es/conversations/95826139>\n\n⚠️ Nunca realices ningún pago fuera de nuestro sitio web... o denuncia el mensaje\n<https://help.homeexchange.com/hc/es/articles/360009410197--C%C3%B3mo-puedo-reportar-a-un-socio-que-solicita-gastos-no-permitidos>\n. ⚠️\n\nModifica tus preferencias en la configuración de tu cuenta\n<https://www.homeexchange.com/es/user/settings/4046838>`,
}

// Correo REAL de Booking (hilo 1a062a30dc0828d5, luis ortiz benito): la referencia va EN CLARO.
const BOOKING = {
  from: '6144978627-qkpp.36wg.mpr6.bvnh@guest.booking.com',
  subject: 'Hemos recibido este mensaje de luis ortiz benito',
  body: '##- Escribe tu respuesta sobre esta línea -##\nNúmero de confirmación: 6144978627\nTienes un mensaje nuevo de un cliente luis ortiz benito: Me ha llegado como un WhatsApp pidiendo que confirme la reserva\nResponder --> https://admin.booking.com/hotel/hoteladmin/extranet_ng/manage/messaging.html?res_id=145652821',
}

test('NO saca número de los enlaces del cuerpo (caso HomeExchange 360009410197)', () => {
  assert.equal(extraerNumConfirmacionDe(HOMEEXCHANGE.subject, HOMEEXCHANGE.body), null)
})

test('sigue leyendo la referencia en claro de Booking', () => {
  assert.equal(extraerNumConfirmacionDe(BOOKING.subject, BOOKING.body), '6144978627')
})

test('la referencia en claro gana al primer número largo del texto', () => {
  const cuerpo = 'Reserva 999999999999 del portal\nNúmero de confirmación: 5815945265\ntexto'
  assert.equal(extraerNumConfirmacionDe('asunto', cuerpo), '5815945265')
})

test('sin número devuelve null (no se inventa)', () => {
  assert.equal(extraerNumConfirmacionDe('Hola', 'un mensaje sin referencias'), null)
})

test('reconoce los remitentes de canales por los que entran reservas', () => {
  for (const from of [
    '6144978627-qkpp.36wg.mpr6.bvnh@guest.booking.com',
    'noreply@mailrouter-601.fra3.prod.booking.com',
    'service@smoobu.com',
    'Expedia <no-reply@expedia.com>',
    'x@agoda.com',
    'automated@airbnb.com',
  ]) assert.equal(esRemitenteDeCanal(from), true, from)
})

test('HomeExchange NO es un canal de reservas', () => {
  assert.equal(esRemitenteDeCanal(HOMEEXCHANGE.from), false)
  assert.equal(esRemitenteDeCanal('notifications@homeexchange.com'), false)
})

test('un dominio que solo TERMINA parecido no cuela', () => {
  assert.equal(esRemitenteDeCanal('spam@notbooking.com'), false)
  assert.equal(esRemitenteDeCanal('spam@booking.com.evil.net'), false)
  assert.equal(esRemitenteDeCanal(''), false)
})
