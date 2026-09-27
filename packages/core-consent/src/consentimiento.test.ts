import { test } from 'node:test'
import assert from 'node:assert/strict'
import { puedeCargar } from './consentimiento.ts'

test('sin credencial no carga aunque haya consentimiento', () => {
  assert.equal(puedeCargar({ statistics: true }, { categoria: 'statistics', credencial: '' }), false)
})

test('sin consentimiento (null) no carga', () => {
  assert.equal(puedeCargar(null, { categoria: 'statistics', credencial: 'G-XXX' }), false)
})

test('consentimiento undefined en la categoría no carga (no es un sí)', () => {
  assert.equal(puedeCargar({ marketing: true }, { categoria: 'statistics', credencial: 'G-XXX' }), false)
})

test('consentimiento explícitamente denegado no carga', () => {
  assert.equal(puedeCargar({ statistics: false }, { categoria: 'statistics', credencial: 'G-XXX' }), false)
})

test('con credencial y consentimiento true en la categoría, carga', () => {
  assert.equal(puedeCargar({ statistics: true }, { categoria: 'statistics', credencial: 'G-XXX' }), true)
})

test('categorías distintas no se cruzan: marketing true no habilita statistics', () => {
  assert.equal(
    puedeCargar({ marketing: true, statistics: false }, { categoria: 'statistics', credencial: 'G-XXX' }),
    false
  )
})
