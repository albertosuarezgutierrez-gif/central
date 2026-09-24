import test from 'node:test'
import assert from 'node:assert/strict'
import { destinoValido, MAX_DESTINO } from './destino.ts'

test('email: acepta lo entregable', () => {
  for (const bueno of [
    'alberto@grupoasegura.es',
    'a.b+etiqueta@sub.dominio.co.uk',
    'nombre_apellido@dominio.com',
    "o'brien@dominio.es",
  ]) {
    assert.equal(destinoValido('email', bueno), true, bueno)
  }
})

test('email: rechaza lo que no es un correo', () => {
  for (const malo of [
    '',
    'hola',
    'sin-arroba.com',
    '@dominio.com',
    'a@',
    'a@b', // dominio sin punto: en internet no se entrega
    'a@@b.com',
    'a b@dominio.com',
    'a@dominio .com',
    'a@dominio,com',
    'uno@dominio.com, dos@dominio.com', // inyección de un segundo destinatario
    'a@dominio.com\nBcc: otro@dominio.com', // inyección de cabecera
  ]) {
    assert.equal(destinoValido('email', malo), false, JSON.stringify(malo))
  }
})

test('whatsapp: E.164 con prefijo obligatorio', () => {
  assert.equal(destinoValido('whatsapp', '+34600123456'), true)
  assert.equal(destinoValido('whatsapp', '+12025550123'), true)

  // Sin `+` no se sabe el país. NO se le añade `+34`: suponer el país es
  // inventarse un dato de la persona.
  assert.equal(destinoValido('whatsapp', '600123456'), false)
  assert.equal(destinoValido('whatsapp', '0034600123456'), false)
  assert.equal(destinoValido('whatsapp', '+0600123456'), false, 'no empieza por 0')
  assert.equal(destinoValido('whatsapp', '+34 600 12 34 56'), false, 'sin espacios')
  assert.equal(destinoValido('whatsapp', '+341234567'), true, '8 dígitos, mínimo')
  assert.equal(destinoValido('whatsapp', '+3412345'), false, 'menos de 8 dígitos')
  assert.equal(destinoValido('whatsapp', `+${'9'.repeat(16)}`), false, 'más de 15 dígitos')
})

test('los dos tipos no se confunden entre sí', () => {
  assert.equal(destinoValido('whatsapp', 'alberto@grupoasegura.es'), false)
  assert.equal(destinoValido('email', '+34600123456'), false)
})

test('longitud: corta a MAX_DESTINO', () => {
  const largo = `${'a'.repeat(MAX_DESTINO)}@dominio.com`
  assert.equal(destinoValido('email', largo), false)
  assert.equal(destinoValido('email', ''), false)
})

/**
 * El cepo de la decisión de diseño: NO normaliza. Si algún día alguien le mete
 * un `trim()`/`toLowerCase()` y devuelve la cadena limpia, este test no lo caza
 * —devuelve boolean— pero sí caza el primer paso: que un destino con espacios
 * alrededor se RECHACE en vez de aceptarse como si fuera el limpio. Aceptarlo
 * sería guardar el hash de una cadena y buscar el de otra.
 */
test('un destino con espacios se rechaza, no se limpia', () => {
  assert.equal(destinoValido('email', ' alberto@grupoasegura.es'), false)
  assert.equal(destinoValido('email', 'alberto@grupoasegura.es '), false)
  assert.equal(destinoValido('whatsapp', ' +34600123456'), false)
})

test('entradas que no son cadena no revientan', () => {
  for (const raro of [null, undefined, 42, {}, []]) {
    assert.equal(destinoValido('email', raro as unknown as string), false)
  }
})
