import { test } from 'node:test'
import assert from 'node:assert/strict'

import { zWebhookWhatsapp, crudoMinimizado } from './payload.ts'
import {
  decisionHistorial,
  estadoDeEventoCuenta,
  extraerEventos,
  interpretarEdicion,
  textoAvisoConexion,
  ERROR_HISTORIAL_NO_COMPARTIDO,
} from './eventos.ts'
import { importarHistorial } from './config.ts'

const NUMERO = '1234567890'
const cuerpo = (changes: unknown[], id = 'WABA1') => zWebhookWhatsapp.parse({ object: 'whatsapp_business_account', entry: [{ id, changes }] })
const metadata = (id = NUMERO) => ({ display_phone_number: '34600000000', phone_number_id: id })

test('history con 2593109 («No compartir chats») → no_compartido, sin hilos ni texto', () => {
  const b = cuerpo([
    {
      field: 'history',
      value: {
        messaging_product: 'whatsapp',
        metadata: metadata(),
        history: [{ errors: [{ code: 2593109, title: 'History sync is turned off by the business from the WhatsApp Business App' }] }],
      },
    },
  ])
  const ev = extraerEventos(b, NUMERO)
  assert.equal(ev.historial.length, 1)
  assert.deepEqual(ev.historial[0].errores, [ERROR_HISTORIAL_NO_COMPARTIDO])
  assert.equal(decisionHistorial(ev.historial[0], true), 'no_compartido')
  assert.equal(decisionHistorial(ev.historial[0], false), 'no_compartido')
})

test('history con 2593109 a nivel de value.errors también cuenta', () => {
  const ev = extraerEventos(cuerpo([{ field: 'history', value: { metadata: metadata(), errors: [{ code: 2593109 }] } }]), NUMERO)
  assert.equal(decisionHistorial(ev.historial[0], false), 'no_compartido')
})

test('history con hilos y sin flag → descartado (solo cuenta hilos y mensajes); con flag → guardar crudo', () => {
  const b = cuerpo([
    {
      field: 'history',
      value: {
        metadata: metadata(),
        history: [
          {
            metadata: { phase: 0, chunk_order: 1, progress: 50 },
            threads: [
              { id: '34611111111', messages: [{ id: 'w1', type: 'text', text: { body: 'secreto' } }, { id: 'w2', type: 'text', text: { body: 'x' } }] },
              { id: '34622222222', messages: [{ id: 'w3', type: 'text', text: { body: 'y' } }] },
            ],
          },
        ],
      },
    },
  ])
  const ev = extraerEventos(b, NUMERO)
  assert.equal(ev.historial[0].hilos, 2)
  assert.equal(ev.historial[0].mensajes, 3)
  assert.equal(ev.historial[0].progreso, 50)
  assert.equal(decisionHistorial(ev.historial[0], importarHistorial({})), 'descartado')
  assert.equal(decisionHistorial(ev.historial[0], importarHistorial({ WHATSAPP_IMPORTAR_HISTORIAL: 'true' })), 'descartado')
  assert.equal(decisionHistorial(ev.historial[0], importarHistorial({ WHATSAPP_IMPORTAR_HISTORIAL: '1' })), 'guardar_crudo')
})

test('history de OTRO número de la WABA no cuenta', () => {
  const ev = extraerEventos(cuerpo([{ field: 'history', value: { metadata: metadata('999'), history: [{ errors: [{ code: 2593109 }] }] } }]), NUMERO)
  assert.equal(ev.historial.length, 0)
  assert.equal(ev.otroNumero, 1)
})

test('smb_app_state_sync: solo acuse (cuántos), nada de los contactos', () => {
  const ev = extraerEventos(
    cuerpo([{ field: 'smb_app_state_sync', value: { metadata: metadata(), state_sync: [{ type: 'contact', contact: { full_name: 'Pepe', phone_number: '34600' }, action: 'add' }, { type: 'contact', action: 'remove' }] } }]),
    NUMERO,
  )
  assert.equal(ev.contactosSync, 2)
  assert.ok(!JSON.stringify(ev).includes('Pepe'))
})

test('account_update PARTNER_REMOVED → desconectada con su motivo y aviso sin datos personales', () => {
  const ev = extraerEventos(
    cuerpo([{ field: 'account_update', value: { phone_number: '34600123456', event: 'PARTNER_REMOVED', disconnection_info: { reason: 'PRIMARY_INACTIVITY' } } }], 'WABA9'),
    NUMERO,
  )
  assert.deepEqual(ev.cuentas, [{ wabaId: 'WABA9', evento: 'PARTNER_REMOVED', motivo: 'PRIMARY_INACTIVITY' }])
  const e = estadoDeEventoCuenta(ev.cuentas[0].evento, ev.cuentas[0].motivo)
  assert.deepEqual(e, { estado: 'desconectada', motivo: 'PRIMARY_INACTIVITY' })
  const texto = textoAvisoConexion(e!.estado, e!.motivo)
  assert.match(texto, /DESCONECTADO/)
  assert.match(texto, /14 días/)
  assert.ok(!texto.includes('34600123456'), 'el aviso no lleva el número')
})

test('account_update: OFFBOARDED → baja; RECONNECTED → conectada; otro evento → no cambia nada', () => {
  assert.deepEqual(estadoDeEventoCuenta('ACCOUNT_OFFBOARDED', null), { estado: 'baja', motivo: 'ACCOUNT_OFFBOARDED' })
  assert.deepEqual(estadoDeEventoCuenta('ACCOUNT_RECONNECTED', null), { estado: 'conectada', motivo: 'ACCOUNT_RECONNECTED' })
  assert.equal(estadoDeEventoCuenta('VERIFIED_ACCOUNT', null), null)
  assert.deepEqual(estadoDeEventoCuenta('PARTNER_REMOVED', null), { estado: 'desconectada', motivo: 'SIN_MOTIVO' })
  for (const m of ['COMPANION_INACTIVITY', 'BUSINESS_DOWNGRADE', 'CHANGE_NUMBER', 'USER_RE_REGISTERED', 'ACCOUNT_DISCONNECTED']) {
    assert.doesNotMatch(textoAvisoConexion('desconectada', m), /motivo de Meta/, `${m} tiene texto propio`)
  }
  assert.match(textoAvisoConexion('conectada', 'ACCOUNT_RECONNECTED'), /recuperada/)
})

test('edit: original + texto nuevo (texto y media con pie); revoke: original; sin original → inválida', () => {
  assert.deepEqual(interpretarEdicion({ id: 'w9', type: 'edit', edit: { original_message_id: 'wamid.ORIG', message: { type: 'text', text: { body: 'Corregido' } } } }), {
    tipo: 'edit',
    original: 'wamid.ORIG',
    texto: 'Corregido',
  })
  assert.deepEqual(interpretarEdicion({ id: 'w9', type: 'edit', edit: { original_message_id: 'wamid.O', message: { type: 'image', image: { caption: 'foto' } } } }), {
    tipo: 'edit',
    original: 'wamid.O',
    texto: '[imagen] foto',
  })
  assert.deepEqual(interpretarEdicion({ id: 'w9', type: 'revoke', revoke: { original_message_id: 'wamid.ORIG' } }), { tipo: 'revoke', original: 'wamid.ORIG' })
  assert.equal(interpretarEdicion({ id: 'w9', type: 'revoke', revoke: {} })?.tipo, 'invalida')
  assert.equal(interpretarEdicion({ id: 'w9', type: 'text', text: { body: 'hola' } }), null)
})

test('crudo minimizado de una edición: conserva a qué mensaje apunta, sin el texto nuevo', () => {
  const c = crudoMinimizado({ field: 'messages', metadata: metadata(), message: { id: 'w9', type: 'edit', timestamp: '1', edit: { original_message_id: 'wamid.ORIG', message: { type: 'text', text: { body: 'SECRETO' } } } } })
  assert.equal((c.message as Record<string, unknown>).original_message_id, 'wamid.ORIG')
  assert.ok(!JSON.stringify(c).includes('SECRETO'))
})

test('error 131060 (mensaje no admitido): se cuenta, no rompe el Zod ni la extracción', () => {
  const ev = extraerEventos(
    cuerpo([
      {
        field: 'messages',
        value: {
          metadata: metadata(),
          messages: [{ from: '34600123456', id: 'wamid.U', timestamp: '1759651200', type: 'unsupported', errors: [{ code: 131060, title: 'Message type unsupported' }] }],
        },
      },
    ]),
    NUMERO,
  )
  assert.equal(ev.noAdmitidos, 1)
})

test('campos de cuenta desconocidos o mal formados no rompen nada', () => {
  const ev = extraerEventos(cuerpo([{ field: 'account_update', value: { sin_evento: true } }, { field: 'history', value: 'raro' }, { field: 'nuevo_campo', value: {} }]), NUMERO)
  assert.deepEqual(ev, { historial: [], contactosSync: 0, cuentas: [], noAdmitidos: 0, otroNumero: 0 })
})
