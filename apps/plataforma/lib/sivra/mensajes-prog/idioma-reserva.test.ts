import { test } from 'node:test'
import assert from 'node:assert/strict'
import { decidirIdioma, notaIdioma } from './idioma-reserva.ts'

test('idioma declarado en español: conocido y sin traducir', () => {
  const d = decidirIdioma('es')
  assert.deepEqual(d, { idioma: 'es', conocido: true, traducir: false })
  assert.equal(notaIdioma(d), '')
})

test('idioma declarado distinto: se traduce', () => {
  assert.deepEqual(decidirIdioma('EN'), { idioma: 'en', conocido: true, traducir: true })
  assert.deepEqual(decidirIdioma('zh-TW'), { idioma: 'zh', conocido: true, traducir: true })
})

test('SIN idioma (el caso Agoda) NO es lo mismo que «es»', () => {
  const d = decidirIdioma('')
  assert.equal(d.idioma, 'es', 'se escribe en español porque es lo único que sabemos redactar')
  assert.equal(d.conocido, false, 'pero NO se archiva como si el huésped lo hubiera elegido')
  assert.equal(d.traducir, false)
  assert.match(notaIdioma(d, 'Agoda'), /no trae idioma \(canal Agoda\)/)
})

test('null/undefined se tratan como hueco, no como español elegido', () => {
  assert.equal(decidirIdioma(null).conocido, false)
  assert.equal(decidirIdioma(undefined).conocido, false)
  assert.equal(decidirIdioma('   ').conocido, false)
})
