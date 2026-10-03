import { test } from 'node:test'
import assert from 'node:assert/strict'
import { MEDIADOR } from '@central/module-seguros'
import { destinatarioDeCliente, type ClienteConEmails } from './avisos-vencimiento-reglas.ts'

const CANAL = MEDIADOR.identidad.email
const f = (c: Partial<ClienteConEmails>): ClienteConEmails => ({ emailOptOutAt: null, email: null, emails: [], ...c }) as ClienteConEmails

test('el canal de la correduría no es destinatario (ni suelto ni en cliente_emails)', () => {
  assert.equal(destinatarioDeCliente(f({ email: CANAL })), null)
  assert.equal(destinatarioDeCliente(f({ emails: [{ email: CANAL, esPrincipal: true, createdAt: new Date() }] as never })), null)
})

test('se salta el canal y usa el email propio', () => {
  assert.equal(
    destinatarioDeCliente(f({ email: 'ana@example.com', emails: [{ email: CANAL, esPrincipal: true, createdAt: new Date() }] as never })),
    'ana@example.com',
  )
})
