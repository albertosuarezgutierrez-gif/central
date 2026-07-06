import { test } from 'node:test'
import assert from 'node:assert/strict'
import { clasificarPorKeywords, normalizarTexto } from './subcategoria-keywords.ts'

test('supermercados obvios', () => {
  assert.equal(clasificarPorKeywords('COMPRA', 'MERCADONA S.A.'), 'supermercado')
  assert.equal(clasificarPorKeywords('SUPERMERCADOS DIA', null), 'supermercado')
  assert.equal(clasificarPorKeywords(null, 'LIDL SEVILLA'), 'supermercado')
  assert.equal(clasificarPorKeywords('PAGO EN CARREFOUR EXPRESS', null), 'supermercado')
})

test('bares y restaurantes', () => {
  assert.equal(clasificarPorKeywords(null, 'BAR LA ESQUINA'), 'restaurante_bar')
  assert.equal(clasificarPorKeywords('RESTAURANTE EL FARO', null), 'restaurante_bar')
  assert.equal(clasificarPorKeywords(null, 'GLOVO'), 'restaurante_bar')
})

test('gasolina y transporte no se confunden', () => {
  assert.equal(clasificarPorKeywords(null, 'REPSOL E.S. ALCALA'), 'gasolina')
  assert.equal(clasificarPorKeywords(null, 'UBER TRIP'), 'transporte')
  assert.equal(clasificarPorKeywords(null, 'RENFE VIAJEROS'), 'transporte')
})

test('suscripciones', () => {
  assert.equal(clasificarPorKeywords(null, 'NETFLIX.COM'), 'suscripcion')
  assert.equal(clasificarPorKeywords('PAGO CLAUDE.AI ANTHROPIC', null), 'suscripcion')
})

test('suministros vs supermercado (DIGI/IBERDROLA)', () => {
  assert.equal(clasificarPorKeywords('RECIBO DIGI SPAIN TELECO', null), 'suministros_piso')
  assert.equal(clasificarPorKeywords(null, 'IBERDROLA CLIENTES'), 'suministros_piso')
})

test('farmacia', () => {
  assert.equal(clasificarPorKeywords(null, 'FARMACIA LOPEZ'), 'farmacia')
})

test('devuelve null cuando nada casa', () => {
  assert.equal(clasificarPorKeywords('TRANSFERENCIA RECIBIDA', 'JUAN PEREZ'), null)
  assert.equal(clasificarPorKeywords('', ''), null)
  assert.equal(clasificarPorKeywords(null, null), null)
})

test("'BAR ' no casa dentro de 'BARCELONA'", () => {
  assert.equal(clasificarPorKeywords(null, 'HOTEL BARCELONA'), null)
})

test('normalizarTexto quita acentos y envuelve en espacios', () => {
  assert.equal(normalizarTexto('Café'), ' CAFE ')
  assert.equal(normalizarTexto(null), '')
  assert.equal(normalizarTexto('  '), '')
})
