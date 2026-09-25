import { test } from 'node:test'
import assert from 'node:assert/strict'
import { leerCorreos, titularCorreo, type CorreoCliente } from './correos-cliente.ts'

const base: CorreoCliente = {
  id: 'c1', tipo: 'felicitacion', asunto: '¡Feliz cumpleaños, Rafael!', destino: 'r@x.es',
  enviadoEn: '2026-09-25T16:00:01Z', estado: 'enviado', error: null, conSeguimiento: true, eventos: [],
}
const ev = (tipo: CorreoCliente['eventos'][number]['tipo']) => ({ tipo, fecha: '2026-09-25T16:00:05Z', detalle: {} })

test('sin respuesta del puerto es «no se pudo leer» (null), nunca «no se le ha escrito» ([])', () => {
  assert.equal(leerCorreos(undefined), null)
  assert.equal(leerCorreos({}), null)
  assert.deepEqual(leerCorreos([]), [])
})

test('una fila coja o un evento desconocido se saltan sin tumbar el bloque', () => {
  const r = leerCorreos([
    { id: 'a' },
    { id: 'b', enviadoEn: '2026-09-25T16:00:00Z', conSeguimiento: true, eventos: [{ tipo: 'email.delivered', fecha: '2026-09-25T16:00:03Z', detalle: { x: 1, ip: '1.2.3.4' } }, { tipo: 'contact.created', fecha: 'x' }] },
  ])
  assert.equal(r?.length, 1)
  assert.deepEqual(r?.[0].eventos, [{ tipo: 'email.delivered', fecha: '2026-09-25T16:00:03Z', detalle: { ip: '1.2.3.4' } }])
})

test('el titular dice lo más fuerte que se puede afirmar, y un problema gana a todo', () => {
  assert.equal(titularCorreo({ ...base, eventos: [ev('email.sent')] }).texto, 'Enviado, pendiente de confirmar la entrega')
  assert.equal(titularCorreo({ ...base, eventos: [ev('email.sent'), ev('email.delivered')] }).texto, 'Entregado')
  assert.equal(titularCorreo({ ...base, eventos: [ev('email.delivered'), ev('email.opened')] }).texto, 'Entregado y abierto')
  assert.equal(titularCorreo({ ...base, eventos: [ev('email.delivered'), ev('email.opened'), ev('email.clicked')] }).tono, 'bueno')
  assert.equal(titularCorreo({ ...base, eventos: [ev('email.delivered'), ev('email.bounced')] }).tono, 'malo')
})

test('sin seguimiento no se afirma ni entrega ni fallo; un fallo de envío es «no salió»', () => {
  assert.equal(titularCorreo({ ...base, conSeguimiento: false }).texto, 'Enviado (sin seguimiento)')
  assert.equal(titularCorreo({ ...base, estado: 'fallido' }).texto, 'No salió')
})
