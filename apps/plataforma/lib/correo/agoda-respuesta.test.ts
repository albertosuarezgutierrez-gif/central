import { test } from 'node:test'
import assert from 'node:assert/strict'
import { opcionesRespuestaAgoda, destinoDeRespuesta, elegirReservaAgoda, asuntoRespuesta, agenteSeEncarga, autenticadoPorAgoda, decidirRegistroHilo } from './agoda-respuesta.ts'
import { autenticacionDe } from './imap.ts'

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

test('enrutado = solo si el agente se encarga; cualquier otra acción → aviso de respaldo', () => {
  for (const a of ['auto_enviado', 'propuesto_telegram', 'cobro_enlace_enviado', 'ya_procesado']) assert.equal(agenteSeEncarga(a), true, a)
  for (const a of ['fallo_envio', 'sin_contexto', 'ya_respondido', 'eco_plantilla', 'eco_propio', 'ya_propuesto',
    'host_ultimo_sin_pregunta', 'sin_mensaje_huesped', '', 'accion_futura_desconocida']) assert.equal(agenteSeEncarga(a), false, a)
})

const AR_GMAIL_OK = 'mx.google.com; dkim=pass header.i=@agoda-messaging.com header.s=s1 header.b=AbCd; spf=pass (google.com: domain of x@agoda-messaging.com designates 1.2.3.4 as permitted sender) smtp.mailfrom=x@agoda-messaging.com; dmarc=pass (p=REJECT sp=REJECT dis=NONE) header.from=agoda-messaging.com'

test('DKIM/DMARC de Agoda: pasa solo con dkim=pass o dmarc=pass de agoda.com / agoda-messaging.com', () => {
  assert.equal(autenticadoPorAgoda(AR_GMAIL_OK), true)
  assert.equal(autenticadoPorAgoda('mx.google.com; dkim=pass header.d=agoda.com header.s=k1'), true)
  assert.equal(autenticadoPorAgoda('mx.google.com; dkim=pass header.d=mail.agoda.com'), true)
  assert.equal(autenticadoPorAgoda('mx.google.com; dkim=none; spf=fail; dmarc=pass header.from=agoda.com'), true)
  // Falsificaciones / sin pase
  assert.equal(autenticadoPorAgoda(undefined), false)
  assert.equal(autenticadoPorAgoda(''), false)
  assert.equal(autenticadoPorAgoda('mx.google.com; dkim=fail header.i=@agoda-messaging.com; dmarc=fail header.from=agoda-messaging.com'), false)
  assert.equal(autenticadoPorAgoda('mx.google.com; dkim=pass header.i=@evil.io; spf=pass smtp.mailfrom=agoda-messaging.com; dmarc=fail header.from=agoda-messaging.com'), false)
  assert.equal(autenticadoPorAgoda('mx.google.com; dkim=pass header.d=agoda-messaging.com.evil.io'), false)
  assert.equal(autenticadoPorAgoda('mx.google.com; dkim=pass header.d=notagoda.com'), false)
  assert.equal(autenticadoPorAgoda('mx.google.com; spf=pass smtp.mailfrom=agoda.com'), false)
  // Un dkim=pass anidado en el ARC de un reenviador no cuenta
  assert.equal(autenticadoPorAgoda('mx.google.com; arc=pass (i=1 dkim=pass header.d=agoda.com); dkim=fail header.d=agoda.com'), false)
})

test('solo se mira la cabecera Authentication-Results MÁS ALTA (la del servidor receptor)', () => {
  const lineas = [
    { key: 'authentication-results', line: 'Authentication-Results: mx.google.com;\r\n       dkim=fail header.i=@evil.io; dmarc=fail header.from=agoda-messaging.com' },
    { key: 'from', line: 'From: notifications@agoda-messaging.com' },
    { key: 'authentication-results', line: 'Authentication-Results: falso; dkim=pass header.d=agoda.com' },
  ]
  const ar = autenticacionDe(lineas)
  assert.match(ar!, /^mx\.google\.com; dkim=fail/)
  assert.equal(autenticadoPorAgoda(ar), false)
  assert.equal(autenticacionDe([{ key: 'from', line: 'From: a@b.c' }]), undefined)
  assert.equal(autenticadoPorAgoda(autenticacionDe([{ key: 'Authentication-Results', line: `Authentication-Results: ${AR_GMAIL_OK}` }])), true)
})

test('hilo existente con OTRO destino → conflicto (no se pisa); mismo destino o sin hilo → se registra', () => {
  assert.equal(decidirRegistroHilo(null, 'reply+1@agoda-messaging.com'), 'registrar')
  assert.equal(decidirRegistroHilo(undefined, 'reply+1@agoda-messaging.com'), 'registrar')
  assert.equal(decidirRegistroHilo('reply+1@agoda-messaging.com', 'Reply+1@agoda-messaging.com '), 'registrar')
  assert.equal(decidirRegistroHilo('reply+1@agoda-messaging.com', 'reply+2@agoda-messaging.com'), 'conflicto')
})
