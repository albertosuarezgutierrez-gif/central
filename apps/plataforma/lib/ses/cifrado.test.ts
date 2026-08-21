import { test } from 'node:test'
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'

// La clave se lee en CADA operación (no se memoiza), así que basta con ponerla antes de llamar.
process.env.SES_CRYPTO_KEY = randomBytes(32).toString('base64')

const { cifrarPassword, descifrarPassword } = await import('./cifrado.ts')

test('roundtrip: lo cifrado se descifra igual', () => {
  const pw = 'Fm-9m7;?'
  assert.equal(descifrarPassword(cifrarPassword(pw)), pw)
})

test('dos cifrados de la misma contraseña son DISTINTOS (IV aleatorio)', () => {
  // Si salieran iguales, cualquiera con lectura de la tabla sabría qué pisos comparten
  // contraseña sin descifrar nada.
  assert.notEqual(cifrarPassword('misma'), cifrarPassword('misma'))
})

test('un texto cifrado manipulado FALLA en vez de devolver basura', () => {
  const partes = cifrarPassword('secreta').split('.')
  const datos = Buffer.from(partes[3], 'base64')
  datos[datos.length - 1] ^= 0xff
  partes[3] = datos.toString('base64')
  assert.throws(() => descifrarPassword(partes.join('.')))
})

test('con otra clave NO descifra', () => {
  const guardado = cifrarPassword('secreta')
  const anterior = process.env.SES_CRYPTO_KEY
  process.env.SES_CRYPTO_KEY = randomBytes(32).toString('base64')
  assert.throws(() => descifrarPassword(guardado))
  process.env.SES_CRYPTO_KEY = anterior
})

test('clave de longitud incorrecta falla nombrando el problema', () => {
  const anterior = process.env.SES_CRYPTO_KEY
  process.env.SES_CRYPTO_KEY = Buffer.from('corta').toString('base64')
  assert.throws(() => cifrarPassword('x'), /32 bytes/)
  process.env.SES_CRYPTO_KEY = anterior
})

test('formato desconocido falla explícito', () => {
  assert.throws(() => descifrarPassword('v0.a.b.c'), /formato desconocido/)
  assert.throws(() => descifrarPassword(''), /formato desconocido/)
})

test('no se cifra una contraseña vacía', () => {
  assert.throws(() => cifrarPassword(''))
})
