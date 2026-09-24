import { test } from 'node:test'
import assert from 'node:assert/strict'
import { NOMBRE_IDIOMA, idiomaConocido, nombreIdioma } from './idiomas.ts'

// La lista vieja de los mensajes programados (18) y la del agente (5) no pueden perder a nadie.
test('la tabla única cubre los idiomas que ya se traducían', () => {
  for (const c of ['es', 'en', 'fr', 'de', 'it', 'pt', 'nl', 'pl', 'tr', 'ru', 'sv', 'da', 'no', 'cs', 'sl', 'ro', 'hu', 'el', 'ca']) {
    assert.ok(idiomaConocido(c), c)
  }
})
test('cubre los de escritura no latina que detecta detectLang', () => {
  for (const c of ['zh', 'ja', 'ko', 'ru', 'uk', 'el', 'he', 'ar', 'fa', 'th', 'hi', 'ka', 'hy']) assert.ok(NOMBRE_IDIOMA[c], c)
})
test('código desconocido: se devuelve tal cual, no se inventa', () => {
  assert.equal(idiomaConocido('xx'), false)
  assert.equal(nombreIdioma('xx'), 'xx')
  assert.equal(idiomaConocido('constructor'), false)
})
