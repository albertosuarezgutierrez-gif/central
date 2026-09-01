import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  canalDeAsunto, esRemitenteSmoobu, normalizarCanal, parsearNotificacionSmoobu, propertyIdDePiso,
} from './smoobu-notificacion.ts'

// Copiado LITERAL del correo REAL que disparó el 🚨 falso (01/09/2026, hilo 1a05dd054bf72a06),
// guion largo incluido. La regla del repo: el fixture de un parser sale del documento real, no
// de lo que uno cree que dice — si no, el test pasa sobre la misma suposición equivocada.
const EXPEDIA = {
  from: 'service@smoobu.com',
  subject: 'Nueva reserva para Busto Reform: 03.09.26 – 07.09.26, Karl Brunelliere (Expedia)',
  body: ' Nueva reserva para Busto Reform: 03.09.26 – 07.09.26, Karl Brunelliere (Expedia)\n#### Nueva reserva para Busto Reform: 03.09.26 – 07.09.26, Karl Brunelliere (Expedia)\n\nTienes una nueva reserva de Expedia. Smoobu ha sincronizado esta reserva en otras páginas de reservas.\n\nBusto Reform\nLlegada: Jue., 03.09.26\nSalida: Lun., 07.09.26\nHuésped: Karl Brunelliere\nNúmero: 1\nMensaje del huésped: 1 Double Bed\nNon-Smoking\n\nInicia sesión aquí para ver tu panorama y para gestionar tus reservas.\nhttps://login.smoobu.com/es/booking/detail/153896946\n\nPD: Tu ocupación en Septiembre 2026 es ahora 20.75%.',
}

test('lee el correo REAL de Expedia entero', () => {
  const n = parsearNotificacionSmoobu(EXPEDIA)!
  assert.equal(n.tipo, 'nueva')
  assert.equal(n.piso, 'Busto Reform')
  assert.equal(n.propertyId, 'prop_busto_reform')
  assert.equal(n.canal, 'Expedia')
  assert.equal(n.checkIn, '2026-09-03')
  assert.equal(n.checkOut, '2026-09-07')
  assert.equal(n.huesped, 'Karl Brunelliere')
  // 🚨 El número que el vigía tomó por «reserva que Smoobu no tiene» es el id INTERNO de Smoobu,
  // sacado de su propio enlace a la ficha. Es el mismo que guarda incomes.reservationId.
  assert.equal(n.smoobuId, '153896946')
})

test('el canal NO se da por Booking: sale del asunto de cada correo', () => {
  const agoda = parsearNotificacionSmoobu({
    from: 'service@smoobu.com',
    subject: 'Nueva reserva para Luxury Busto: 23.07.27 – 25.07.27, cheng Lai Yu (Agoda)',
  })!
  assert.equal(agoda.canal, 'Agoda')
  assert.equal(agoda.propertyId, 'prop_luxury_busto')
  assert.equal(agoda.checkIn, '2027-07-23')

  const booking = parsearNotificacionSmoobu({
    from: 'service@smoobu.com',
    subject: 'Nueva cancelación para House sevillana: 20.09.26 – 22.09.26, JUAN PONCE (Booking.com)',
  })!
  assert.equal(booking.tipo, 'cancelacion')
  assert.equal(booking.canal, 'Booking.com')
  // «House sevillana» (así lo escribe Smoobu) casa con el label «House Sevillana».
  assert.equal(booking.propertyId, 'prop_house_sevillana')
})

test('sin canal en el asunto devuelve null, nunca un canal inventado', () => {
  const n = parsearNotificacionSmoobu({
    from: 'service@smoobu.com',
    subject: 'Nueva reserva para Duplex Center: 10.10.26 – 12.10.26, GONCALVES MARIA ELIZABETH',
  })!
  assert.equal(n.canal, null)
  assert.equal(n.huesped, 'GONCALVES MARIA ELIZABETH')
})

test('un canal desconocido se devuelve tal cual, no se fuerza al mapa', () => {
  assert.equal(normalizarCanal('Expedia Group'), 'Expedia Group')
  assert.equal(normalizarCanal('  '), null)
  assert.equal(canalDeAsunto('Nueva reserva para X: 01.01.27 – 02.01.27, Y (Vrbo)'), 'Vrbo')
})

test('NO casa el reenvío de un mensaje de huésped (ese sí es del huésped)', () => {
  assert.equal(parsearNotificacionSmoobu({
    from: 'service@smoobu.com',
    subject: 'Hemos recibido este mensaje de Mirjam Postma',
  }), null)
})

test('NO casa un correo que no venga de Smoobu, aunque el asunto se le parezca', () => {
  assert.equal(esRemitenteSmoobu('noreply@guest.booking.com'), false)
  assert.equal(esRemitenteSmoobu('service@smoobu.com'), true)
  assert.equal(parsearNotificacionSmoobu({
    from: 'phish@smoobu.com.evil.net',
    subject: 'Nueva reserva para Busto Reform: 03.09.26 – 07.09.26, X (Expedia)',
  }), null)
})

test('una fecha imposible es null, no una fecha plausible', () => {
  const n = parsearNotificacionSmoobu({
    from: 'service@smoobu.com',
    subject: 'Nueva reserva para Busto Reform: 31.02.26 – 07.13.26, X (Expedia)',
  })!
  assert.equal(n.checkIn, null)
  assert.equal(n.checkOut, null)
})

test('un piso desconocido no se fuerza a ninguno de los cuatro', () => {
  assert.equal(propertyIdDePiso('Piso que no existe'), null)
  assert.equal(propertyIdDePiso(null), null)
})
