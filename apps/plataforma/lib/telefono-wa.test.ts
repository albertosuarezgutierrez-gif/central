import { test } from 'node:test'
import assert from 'node:assert/strict'
import { esMovilEs, urlWhatsapp } from './telefono-wa.ts'

test('móvil español, con y sin prefijo, y como lo escribe la gente', () => {
  assert.equal(esMovilEs('612345678'), true)
  assert.equal(esMovilEs('712345678'), true)
  assert.equal(esMovilEs('+34612345678'), true)
  assert.equal(esMovilEs('0034612345678'), true)
  assert.equal(esMovilEs('34612345678'), true)
  assert.equal(esMovilEs('612 34 56 78'), true)
  assert.equal(esMovilEs('+34 612-345-678'), true)
  assert.equal(esMovilEs('(+34) 612.345.678'), true)
})

test('un FIJO no es un móvil, por muy válido que sea el número', () => {
  assert.equal(esMovilEs('954123456'), false)
  assert.equal(esMovilEs('+34954123456'), false)
  assert.equal(esMovilEs('900123456'), false)
  assert.equal(esMovilEs('812345678'), false)
})

test('lo que no se puede leer como teléfono no se afirma que sea móvil', () => {
  assert.equal(esMovilEs(''), false)
  assert.equal(esMovilEs('   '), false)
  assert.equal(esMovilEs('61234567'), false, 'ocho dígitos: número corto')
  assert.equal(esMovilEs('6123456789'), false, 'diez dígitos: no es un móvil español')
  assert.equal(esMovilEs('612345678 ext 4'), false, 'con extensión no se adivina cuál es el número')
  assert.equal(esMovilEs('sin teléfono'), false)
  assert.equal(esMovilEs('+351912345678'), false, 'portugués: puede ser móvil, pero no ESPAÑOL')
})

test('la URL de un móvil español lleva el 34 y ningún separador', () => {
  assert.equal(urlWhatsapp('612345678'), 'https://wa.me/34612345678')
  assert.equal(urlWhatsapp('+34 612 34 56 78'), 'https://wa.me/34612345678')
  assert.equal(urlWhatsapp('0034612345678'), 'https://wa.me/34612345678')
  assert.equal(urlWhatsapp('34-712-345-678'), 'https://wa.me/34712345678')
})

test('extranjero plausible: se acepta con su prefijo, entre 8 y 15 dígitos', () => {
  assert.equal(urlWhatsapp('+351912345678'), 'https://wa.me/351912345678')
  assert.equal(urlWhatsapp('00351 912 345 678'), 'https://wa.me/351912345678')
  assert.equal(urlWhatsapp('+1 202 555 0143'), 'https://wa.me/12025550143')
  assert.equal(urlWhatsapp('+3519123'), null, 'siete dígitos: no es un número marcable')
  assert.equal(urlWhatsapp('+3511234567890123456'), null, 'pasa de 15 dígitos (E.164)')
})

test('null cuando NO se puede afirmar que sea un móvil: la UI no pinta nada', () => {
  assert.equal(urlWhatsapp('954123456'), null, 'fijo español')
  assert.equal(urlWhatsapp('+34954123456'), null, 'fijo español con prefijo')
  assert.equal(urlWhatsapp('61234567'), null, 'número corto')
  assert.equal(urlWhatsapp(''), null, 'cadena vacía')
  assert.equal(urlWhatsapp('   '), null)
  assert.equal(urlWhatsapp('cifrado'), null)
  assert.equal(urlWhatsapp('912345678'), null, 'un fijo NO se cuela por la puerta del extranjero')
})
