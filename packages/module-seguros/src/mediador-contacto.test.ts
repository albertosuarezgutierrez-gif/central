// Guardián del teléfono del mediador.
//
// El número se publica en la web (botón de WhatsApp, pie y JSON-LD) y sale de
// un único sitio: `MEDIADOR.identidad.telefono`. Lo que este test evita son las
// tres formas en que un teléfono deja de funcionar SIN que falle ningún build:
//
//   1. guardarlo con espacios o guiones → `wa.me` abre y el chat sale en blanco;
//   2. escribir a mano una segunda versión «legible» que acaba divergiendo de
//      la real cuando una de las dos se corrige;
//   3. perder el `+34` y que el enlace apunte a un número de otro país.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { MEDIADOR, telefonoLegible, whatsappUrl } from './mediador.ts'

test('el teléfono está en E.164 sin separadores', () => {
  assert.match(
    MEDIADOR.identidad.telefono,
    /^\+\d{8,15}$/,
    'el teléfono lleva espacios, guiones o le falta el prefijo: `wa.me` necesita solo dígitos',
  )
})

test('la versión legible SALE del número, no se escribe aparte', () => {
  assert.equal(telefonoLegible().replace(/\s/g, ''), MEDIADOR.identidad.telefono)
  assert.match(telefonoLegible(), /^\+34 \d{3} \d{2} \d{2} \d{2}$/)
})

test('el enlace de WhatsApp va sin «+» y con el mensaje codificado', () => {
  const url = whatsappUrl('Hola, ¿me llamáis?')
  assert.match(url, /^https:\/\/wa\.me\/\d+\?text=/, `forma rara: ${url}`)
  assert.doesNotMatch(url, /wa\.me\/\+/, 'el «+» deja el chat en blanco al abrirse')
  assert.equal(new URL(url).pathname.slice(1), MEDIADOR.identidad.telefono.replace(/\D/g, ''))
  assert.equal(new URL(url).searchParams.get('text'), 'Hola, ¿me llamáis?')
})
