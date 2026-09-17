import { test } from 'node:test'
import assert from 'node:assert/strict'
import { TEXTOS_BANNER } from './textos.ts'

const IDIOMAS = ['es', 'en', 'it'] as const

test('los tres idiomas existen', () => {
  for (const idioma of IDIOMAS) assert.ok(TEXTOS_BANNER[idioma], `falta ${idioma}`)
})

test('los tres idiomas declaran las mismas claves (ningún hueco de traducción)', () => {
  const claves = (idioma: (typeof IDIOMAS)[number]) => Object.keys(TEXTOS_BANNER[idioma]).sort()
  const base = claves('es')
  for (const idioma of IDIOMAS) assert.deepEqual(claves(idioma), base, `${idioma} no cubre las mismas claves que es`)
})

test('ningún texto está vacío', () => {
  for (const idioma of IDIOMAS) {
    for (const [clave, valor] of Object.entries(TEXTOS_BANNER[idioma])) {
      assert.ok(valor.trim().length > 0, `${idioma}.${clave} está vacío`)
    }
  }
})
