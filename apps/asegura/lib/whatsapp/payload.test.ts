import { test } from 'node:test'
import assert from 'node:assert/strict'

import { crudoMinimizado, extraerMensajes, zWebhookWhatsapp } from './payload.ts'

const NUMERO = '1234567890'

function cuerpo(changes: unknown[]) {
  return { object: 'whatsapp_business_account', entry: [{ id: 'WABA', changes }] }
}
const metadata = (id = NUMERO) => ({ display_phone_number: '34600000000', phone_number_id: id })

test('Zod: el cuerpo de Meta válido pasa; otro objeto o sin entry no', () => {
  assert.equal(zWebhookWhatsapp.safeParse(cuerpo([])).success, true)
  assert.equal(zWebhookWhatsapp.safeParse({ object: 'page', entry: [] }).success, false)
  assert.equal(zWebhookWhatsapp.safeParse({ object: 'whatsapp_business_account' }).success, false)
  // Campos nuevos de Meta no tumban la recepción (passthrough).
  assert.equal(zWebhookWhatsapp.safeParse({ ...cuerpo([]), campo_nuevo: 1 }).success, true)
})

test('entrante de texto: wamid, dirección, contraparte, nombre de perfil y fecha', () => {
  const b = zWebhookWhatsapp.parse(
    cuerpo([
      {
        field: 'messages',
        value: {
          messaging_product: 'whatsapp',
          metadata: metadata(),
          contacts: [{ profile: { name: 'Pepe' }, wa_id: '34600123456' }],
          messages: [{ from: '34600123456', id: 'wamid.A', timestamp: '1759651200', type: 'text', text: { body: 'Hola, ¿cuánto me cuesta el seguro del coche?' } }],
        },
      },
    ]),
  )
  const r = extraerMensajes(b, NUMERO)
  assert.equal(r.mensajes.length, 1)
  const m = r.mensajes[0]
  assert.equal(m.wamid, 'wamid.A')
  assert.equal(m.direccion, 'entrante')
  assert.equal(m.contraparte, '34600123456')
  assert.equal(m.perfilNombre, 'Pepe')
  assert.equal(m.texto, 'Hola, ¿cuánto me cuesta el seguro del coche?')
  assert.equal(m.fecha.toISOString(), '2025-10-05T08:00:00.000Z')
})

test('eco del móvil (Coexistence) = SALIENTE y la contraparte es `to`; statuses se ignoran', () => {
  const b = zWebhookWhatsapp.parse(
    cuerpo([
      { field: 'smb_message_echoes', value: { metadata: metadata(), message_echoes: [{ from: '34600000000', to: '34611222333', id: 'wamid.E', timestamp: '1759651300', type: 'text', text: { body: 'Te llamo luego' } }] } },
      { field: 'messages', value: { metadata: metadata(), statuses: [{ id: 'wamid.X', status: 'read' }] } },
    ]),
  )
  const r = extraerMensajes(b, NUMERO)
  assert.equal(r.mensajes.length, 1)
  assert.equal(r.mensajes[0].direccion, 'saliente')
  assert.equal(r.mensajes[0].contraparte, '34611222333')
  assert.equal(r.mensajes[0].perfilNombre, null)
  assert.equal(r.estados, 1)
})

test('no-texto: tipo + marcador (con pie de foto), sin descargar media', () => {
  const b = zWebhookWhatsapp.parse(
    cuerpo([
      {
        field: 'messages',
        value: {
          metadata: metadata(),
          messages: [
            { from: '34600123456', id: 'w1', timestamp: '1', type: 'image', image: { id: 'MEDIA', mime_type: 'image/jpeg', caption: 'mi póliza' } },
            { from: '34600123456', id: 'w2', timestamp: '2', type: 'audio', audio: { id: 'MEDIA2' } },
            { from: '34600123456', id: 'w3', timestamp: '3', type: 'tipo_que_no_existe' },
          ],
        },
      },
    ]),
  )
  const r = extraerMensajes(b, NUMERO)
  assert.deepEqual(r.mensajes.map((m) => [m.tipo, m.texto]), [['image', '[imagen] mi póliza'], ['audio', '[audio]'], ['tipo_que_no_existe', '[tipo_que_no_existe]']])
})

test('otro phone_number_id, otro campo o value mal formado: se cuentan y no se procesan', () => {
  const b = zWebhookWhatsapp.parse(
    cuerpo([
      { field: 'messages', value: { metadata: metadata('OTRO'), messages: [{ from: '1', id: 'w', timestamp: '1', type: 'text', text: { body: 'x' } }] } },
      { field: 'account_update', value: {} },
      { field: 'messages', value: { messages: [] } },
    ]),
  )
  const r = extraerMensajes(b, NUMERO)
  assert.equal(r.mensajes.length, 0)
  assert.equal(r.otroNumero, 1)
  assert.equal(r.otrosCampos, 1)
  assert.equal(r.malFormados, 1)
})

test('crudo minimizado: sin texto, sin nombre, sin números', () => {
  const min = JSON.stringify(
    crudoMinimizado({ field: 'messages', metadata: metadata(), contact: { wa_id: '34600123456', profile: { name: 'Pepe' } }, message: { id: 'w', from: '34600123456', timestamp: '1', type: 'text', text: { body: 'mi DNI es 12345678Z' } } }),
  )
  for (const dato of ['34600123456', 'Pepe', '12345678Z', 'DNI']) assert.ok(!min.includes(dato), `${dato} en ${min}`)
  assert.ok(min.includes('"id":"w"'))
})
