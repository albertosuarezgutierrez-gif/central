import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createCipheriv } from 'node:crypto'
import { claveDesdeSecret, cifrarPin, descifrarPin, descifrarTicketKey } from './tuya-cifrado.ts'

test('claveDesdeSecret: siempre 16 bytes', () => {
  assert.equal(claveDesdeSecret('abc').length, 16)
  assert.equal(claveDesdeSecret('0123456789abcdef0123').length, 16)
  assert.equal(claveDesdeSecret('').length, 16)
})

test('cifrarPin/descifrarPin: roundtrip', () => {
  const clave = claveDesdeSecret('94e2d8c3607742c2')
  const hex = cifrarPin('482913', clave)
  assert.match(hex, /^[0-9A-F]+$/) // hex mayúsculas
  assert.equal(descifrarPin(hex, clave), '482913')
})

test('cifrarPin: determinista con la misma clave', () => {
  const clave = claveDesdeSecret('secret-para-test')
  assert.equal(cifrarPin('123456', clave), cifrarPin('123456', clave))
})

test('descifrarTicketKey: descifra lo que ECB/NoPadding cifró', () => {
  // Ciframos una clave de 16 bytes con el secret para simular el ticket_key que devuelve Tuya.
  const secret = 'mi-access-secret'
  const claveReal = Buffer.from('0123456789abcdef', 'utf8') // 16 bytes
  const c = createCipheriv('aes-128-ecb', claveDesdeSecret(secret), null)
  c.setAutoPadding(false)
  const ticketKeyHex = Buffer.concat([c.update(claveReal), c.final()]).toString('hex')
  assert.deepEqual(descifrarTicketKey(ticketKeyHex, secret), claveReal)
})
