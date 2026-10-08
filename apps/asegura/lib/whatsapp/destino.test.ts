import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import { zWebhookWhatsapp, extraerMensajes } from './payload.ts'
import { extraerEventos } from './eventos.ts'
import { resolverDestino, hayDestino } from './destino.ts'
import { excluidaPorOptOut } from './optout.ts'

const PNID = '1234567890'
const msg = (pnid: string) =>
  zWebhookWhatsapp.parse({
    object: 'whatsapp_business_account',
    entry: [
      {
        id: 'WABA1',
        changes: [
          {
            field: 'messages',
            value: {
              messaging_product: 'whatsapp',
              metadata: { display_phone_number: '34600000000', phone_number_id: pnid },
              contacts: [{ wa_id: '34611111111', profile: { name: 'X' } }],
              messages: [{ id: 'wamid.A', from: '34611111111', timestamp: '1', type: 'text', text: { body: 'hola' } }],
            },
          },
        ],
      },
    ],
  })
const cuenta = (waba: string) =>
  zWebhookWhatsapp.parse({
    object: 'whatsapp_business_account',
    entry: [{ id: waba, changes: [{ field: 'account_update', value: { event: 'PARTNER_REMOVED' } }, { field: 'smb_app_state_sync', value: { state_sync: [{}, {}] } }] }],
  })

test('env vacía + phone id en BD → procesa los mensajes de ese número', () => {
  const d = resolverDestino(undefined, { phoneNumberId: PNID, wabaId: 'WABA1' })
  assert.equal(d.phoneNumberId, PNID)
  assert.equal(extraerMensajes(msg(PNID), d.phoneNumberId!).mensajes.length, 1)
})

test('env vacía + phone id en BD distinto del del evento → ignora (otro número)', () => {
  const d = resolverDestino('  ', { phoneNumberId: PNID, wabaId: 'WABA1' })
  const ex = extraerMensajes(msg('999'), d.phoneNumberId!)
  assert.equal(ex.mensajes.length, 0)
  assert.equal(ex.otroNumero, 1)
})

test('la env manda sobre la BD', () => {
  assert.equal(resolverDestino('ENV1', { phoneNumberId: PNID, wabaId: null }).phoneNumberId, 'ENV1')
})

test('sin env ni BD → sin destino (200 sin procesar)', () => {
  assert.equal(hayDestino(resolverDestino(undefined, null)), false)
  assert.equal(hayDestino(resolverDestino('', { phoneNumberId: null, wabaId: '' })), false)
})

test('eventos de cuenta: sin phone id se aceptan si la WABA coincide con la de BD; si no, no', () => {
  const ok = extraerEventos(cuenta('WABA1'), null, 'WABA1')
  assert.equal(ok.cuentas.length, 1)
  assert.equal(ok.contactosSync, 2)
  const otra = extraerEventos(cuenta('OTRA'), null, 'WABA1')
  assert.equal(otra.contactosSync, 0)
  assert.equal(otra.otroNumero, 1)
  assert.equal(extraerEventos(cuenta('WABA1'), null, null).contactosSync, 0)
})

test('opt-out: conversación o ficha con opt-out no van a la IA', () => {
  assert.equal(excluidaPorOptOut({ opt_out_conv: true }, null), true)
  assert.equal(excluidaPorOptOut({ opt_out_conv: false }, { optOut: true }), true)
  assert.equal(excluidaPorOptOut({ opt_out_conv: false }, { optOut: false }), false)
  assert.equal(excluidaPorOptOut({}, null), false)
})

test('la reclamación SQL excluye conversaciones y clientes con wa_opt_out_at', () => {
  const src = readFileSync(new URL('./analizar.ts', import.meta.url), 'utf8')
  const sql = src.slice(src.indexOf('update conversaciones c set analisis_reclamado_at'), src.indexOf('returning c.id::text'))
  assert.match(sql, /and wa_opt_out_at is null/)
  assert.match(sql, /not exists \(select 1 from clientes cl where cl\.id = conversaciones\.cliente_id and cl\.wa_opt_out_at is not null\)/)
})
