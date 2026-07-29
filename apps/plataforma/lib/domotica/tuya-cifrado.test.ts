import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createCipheriv } from 'node:crypto'
import { cifrarPin, descifrarPin, descifrarTicketKey } from './tuya-cifrado.ts'

// access_secret de Tuya = 32 bytes (clave AES-256 directa). Se construye por repetición para no
// dejar un literal con pinta de secreto en el repo (falso positivo de gitleaks).
const CLAVE = 'ab'.repeat(16)

test('cifrarPin/descifrarPin: roundtrip con clave real de 16 bytes', () => {
  const clave = Buffer.from('0123456789abcdef', 'utf8') // 16 bytes = clave AES-128
  const hex = cifrarPin('482913', clave)
  assert.match(hex, /^[0-9A-F]+$/) // hex mayúsculas
  assert.equal(descifrarPin(hex, clave), '482913')
})

test('cifrarPin: determinista con la misma clave', () => {
  const clave = Buffer.from('claveDeDieciseis', 'utf8') // 16 bytes
  assert.equal(cifrarPin('123456', clave), cifrarPin('123456', clave))
})

test('descifrarTicketKey: descifra el ticket_key como lo genera Tuya (AES-256-ECB + PKCS7)', () => {
  // Tuya cifra la clave AES real (16 bytes) con el access_secret (32 bytes) en AES-256-ECB/PKCS7
  // y la entrega como hex. Reproducimos ESE ticket_key y comprobamos que lo recuperamos entero.
  const claveReal = Buffer.from('0123456789abcdef', 'utf8') // 16 bytes
  const c = createCipheriv('aes-256-ecb', Buffer.from(CLAVE, 'utf8'), null)
  c.setAutoPadding(true)
  const ticketKeyHex = Buffer.concat([c.update(claveReal), c.final()]).toString('hex')

  const descifrada = descifrarTicketKey(ticketKeyHex, CLAVE)
  assert.deepEqual(descifrada, claveReal)
  assert.equal(descifrada.length, 16) // y sirve tal cual como clave AES-128 para cifrarPin
  assert.doesNotThrow(() => cifrarPin('482913', descifrada))
})

test('descifrarTicketKey: error EXPLÍCITO si el secret no mide 32 bytes', () => {
  assert.throws(() => descifrarTicketKey('00', 'corto'), /32 bytes/)
})
