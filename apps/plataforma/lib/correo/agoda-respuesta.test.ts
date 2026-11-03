import { test } from 'node:test'
import assert from 'node:assert/strict'
import { opcionesRespuestaAgoda, destinoDeRespuesta, elegirReservaAgoda, asuntoRespuesta } from './agoda-respuesta.ts'

const HILO = { messageId: '<abc@agoda-messaging.com>', referencias: ['<prev@agoda-messaging.com>'], responderA: 'reply+123@agoda-messaging.com', asunto: 'Reply from Nicolas Iha (Nov 3-5, 2026)' }

test('la respuesta va al mismo hilo: In-Reply-To, References y Re:', () => {
  const o = opcionesRespuestaAgoda(HILO, 'Hola Nicolas, la entrada es a las 15:00.', 'alberto@example.com')!
  assert.equal(o.to, 'reply+123@agoda-messaging.com')
  assert.equal(o.subject, 'Re: Reply from Nicolas Iha (Nov 3-5, 2026)')
  assert.equal(o.inReplyTo, '<abc@agoda-messaging.com>')
  assert.deepEqual(o.references, ['<prev@agoda-messaging.com>', '<abc@agoda-messaging.com>'])
})

test('nunca responde a un destino que no es de Agoda ni sin Message-ID', () => {
  assert.equal(opcionesRespuestaAgoda({ ...HILO, responderA: 'victima@gmail.com' }, 'x', 'a@b.es'), null)
  assert.equal(opcionesRespuestaAgoda({ ...HILO, responderA: 'x@agoda-messaging.com.evil.io' }, 'x', 'a@b.es'), null)
  assert.equal(opcionesRespuestaAgoda({ ...HILO, messageId: 'sin-corchetes' }, 'x', 'a@b.es'), null)
  assert.equal(opcionesRespuestaAgoda(HILO, '  ', 'a@b.es'), null)
})

test('destino: Reply-To de Agoda; si no, el remitente; si ninguno es de Agoda, null', () => {
  assert.equal(destinoDeRespuesta('R@agoda-messaging.com', 'notifications@agoda-messaging.com'), 'r@agoda-messaging.com')
  assert.equal(destinoDeRespuesta('otro@gmail.com', 'notifications@agoda-messaging.com'), 'notifications@agoda-messaging.com')
  assert.equal(destinoDeRespuesta(undefined, 'a@gmail.com'), null)
  assert.equal(asuntoRespuesta('Re: ya'), 'Re: ya')
})

test('reserva por huésped + fechas: una sola o nada', () => {
  const b = (id: number, nombre: string, a = '2026-11-03', d = '2026-11-05', canal = 'Agoda') => ({ id, 'guest-name': nombre, arrival: a, departure: d, channel: { name: canal } })
  const aviso = { huesped: 'Nicolas Iha', llegada: '2026-11-03', salida: '2026-11-05' }
  assert.equal(elegirReservaAgoda([b(1, 'Nicolas Iha'), b(2, 'Otro Huesped')], aviso), '1')
  assert.equal(elegirReservaAgoda([b(1, 'Nicolas Iha'), b(2, 'Iha Nicolas')], aviso), null, 'dos candidatas: no se adivina')
  assert.equal(elegirReservaAgoda([b(1, 'Nicolas Iha', '2026-11-04')], aviso), null)
  assert.equal(elegirReservaAgoda([b(1, 'Nicolas Iha', undefined, undefined, 'Booking.com')], aviso), null)
  assert.equal(elegirReservaAgoda([b(1, 'Nicolas Iha')], { ...aviso, llegada: null }), null)
})
