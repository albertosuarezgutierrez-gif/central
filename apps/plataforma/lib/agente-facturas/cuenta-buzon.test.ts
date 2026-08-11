// Test puro de resolverCuentaBuzon (a quién se le atribuye el buzón Gmail de facturas).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { resolverCuentaBuzon } from './cuenta-buzon.ts'

const CUENTAS = [
  { id: 'alberto', email: 'alberto.suarez.gutierrez@gmail.com', esDemo: false },
  { id: 'pilar', email: 'pilar.pina.franco@gmail.com', esDemo: false },
  { id: 'demo', email: 'demo-jj@central.local', esDemo: true },
]

test('elige la cuenta cuyo email coincide con GMAIL_USER', () => {
  const r = resolverCuentaBuzon(CUENTAS, { gmailUser: 'alberto.suarez.gutierrez@gmail.com' })
  assert.equal(r, 'alberto')
})

test('el match de email ignora mayúsculas/espacios', () => {
  const r = resolverCuentaBuzon(CUENTAS, { gmailUser: '  ALBERTO.SUAREZ.GUTIERREZ@GMAIL.COM ' })
  assert.equal(r, 'alberto')
})

test('FACTURAS_CUENTA_ID tiene prioridad sobre el email', () => {
  const r = resolverCuentaBuzon(CUENTAS, { facturaCuentaId: 'pilar', gmailUser: 'alberto.suarez.gutierrez@gmail.com' })
  assert.equal(r, 'pilar')
})

test('NUNCA elige una cuenta demo (aunque su email coincida)', () => {
  const r = resolverCuentaBuzon(CUENTAS, { gmailUser: 'demo-jj@central.local' })
  assert.equal(r, null) // no hay real que coincida y hay >1 real → no adivina
})

test('sin match ni env, con varias cuentas reales → null (no adivina)', () => {
  const r = resolverCuentaBuzon(CUENTAS, {})
  assert.equal(r, null)
})

test('sin match, pero UNA sola cuenta real → esa', () => {
  const r = resolverCuentaBuzon(
    [{ id: 'solo', email: 'x@y.com', esDemo: false }, { id: 'demo', email: null, esDemo: true }],
    { gmailUser: 'otro@correo.com' },
  )
  assert.equal(r, 'solo')
})

test('FACTURAS_CUENTA_ID inexistente se ignora (cae al email)', () => {
  const r = resolverCuentaBuzon(CUENTAS, { facturaCuentaId: 'fantasma', gmailUser: 'pilar.pina.franco@gmail.com' })
  assert.equal(r, 'pilar')
})
