// Tests del parser de avisos de reserva de Booking. Los fixtures son texto REAL de los correos
// del buzón (15/06/2026, 08/06/2026, 13/02/2026 y 12/08/2020) — no se redactan de memoria.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parsearAvisoBooking, pisoDesdeNombre, veredictoAviso } from './reserva-booking.ts'

const EXTRACTO_REAL_LUXURY = `   Por motivos de seguridad, asegúrate de que tu URL sea
   https://admin.booking.com cuando inicies sesión.

                Booking.com Luxury Busto Patio privado Centro

Booking confirmation — 5569210843
IATA/TIDS: PC029090

   Hola, Luxury Busto Patio privado Centro:
   Debido a un error, tu channel manager o sistema de gestión de
   alojamientos (PMS) no se han actualizado con la nueva reserva que
   acabas de recibir a través de Booking.com.
   1- Consulta la nueva reserva aquí (fecha de check-in: sábado, 1 de
   agosto de 2026)`

test('aviso real «⚠️ Nueva reserva no registrada» → tipo, ref, check-in y piso', () => {
  const a = parsearAvisoBooking({
    from: 'noreply@booking.com',
    subject: 'Booking.com - ⚠️ Nueva reserva no registrada (5569210843, 1/8/2026)',
    extracto: EXTRACTO_REAL_LUXURY,
  })
  assert.ok(a)
  assert.equal(a!.tipo, 'nueva')
  assert.equal(a!.ref, '5569210843')
  assert.equal(a!.checkIn, '2026-08-01')
  assert.equal(a!.propertyId, 'prop_luxury_busto')
  assert.equal(a!.nombrePiso, 'Luxury Busto Patio privado Centro')
})

test('aviso real «⚠️ Cancelación no registrada» → tipo cancelacion', () => {
  const a = parsearAvisoBooking({
    from: 'noreply@booking.com',
    subject: 'Booking.com - ⚠️ Cancelación no registrada (5394273923, 26/6/2026)',
    extracto: 'Booking.com Luxury Busto Patio privado Centro\nCancellation —',
  })
  assert.ok(a)
  assert.equal(a!.tipo, 'cancelacion')
  assert.equal(a!.ref, '5394273923')
  assert.equal(a!.checkIn, '2026-06-26')
})

test('nombre antiguo ambiguo «Luxury Center» (correo real 13/02/2026) → piso null, nombre conservado', () => {
  const a = parsearAvisoBooking({
    from: 'noreply@booking.com',
    subject: 'Booking.com - ⚠️ Nueva reserva no registrada (6488440355, 28/2/2026)',
    extracto: 'Booking.com Luxury Center\nHola, Luxury Center:',
  })
  assert.ok(a)
  assert.equal(a!.propertyId, null)
  assert.equal(a!.nombrePiso, 'Luxury Center')
})

test('confirmación ordinaria estilo 2020 (fecha textual en español) también se entiende', () => {
  const a = parsearAvisoBooking({
    from: 'noreply@booking.com',
    subject: 'Booking.com - ¡Nueva reserva! Information about new reservation (2421710882, sábado, 15 de agosto de 2020)',
    extracto: 'Booking.com House Sevillana',
  })
  assert.ok(a)
  assert.equal(a!.tipo, 'nueva')
  assert.equal(a!.ref, '2421710882')
  assert.equal(a!.checkIn, '2020-08-15')
  assert.equal(a!.propertyId, 'prop_house_sevillana')
})

test('un mensaje de huésped o un remitente ajeno NO son un aviso de reserva', () => {
  assert.equal(parsearAvisoBooking({
    from: '6183196484-xxxx@guest.booking.com',
    subject: 'Hemos recibido este mensaje de Raquel Rocamora Mateo',
    extracto: 'Número de confirmación: 6183196484',
  }), null)
  // El asunto correcto desde un remitente que NO es booking.com (reenvío/suplantación) tampoco.
  assert.equal(parsearAvisoBooking({
    from: 'alguien@example.com',
    subject: 'Booking.com - ⚠️ Nueva reserva no registrada (5569210843, 1/8/2026)',
    extracto: '',
  }), null)
})

test('pisoDesdeNombre: los 4 nombres actuales mapean; los ambiguos no', () => {
  assert.equal(pisoDesdeNombre('House sevillana'), 'prop_house_sevillana')
  assert.equal(pisoDesdeNombre('Duplex Center'), 'prop_duplex_center')
  assert.equal(pisoDesdeNombre('Luxury Busto Patio privado Centro'), 'prop_luxury_busto')
  assert.equal(pisoDesdeNombre('Busto Reform'), 'prop_busto_reform')
  assert.equal(pisoDesdeNombre('Luxury Center'), null)
})

test('veredictoAviso: la cancelación invierte la lógica y «no se pudo mirar» nunca decide', () => {
  assert.equal(veredictoAviso('nueva', true), 'ok')
  assert.equal(veredictoAviso('nueva', false), 'problema')
  assert.equal(veredictoAviso('cancelacion', true), 'problema')
  assert.equal(veredictoAviso('cancelacion', false), 'ok')
  assert.equal(veredictoAviso('nueva', null), 'sin_comprobar')
  assert.equal(veredictoAviso('cancelacion', null), 'sin_comprobar')
})
