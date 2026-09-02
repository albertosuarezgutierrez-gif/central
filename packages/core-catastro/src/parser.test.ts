import { test } from 'node:test'
import assert from 'node:assert/strict'
import { paramsDnploc } from './parser.ts'

// La dirección tal y como la dice un cliente de hogar (caso real, 02/09/2026).
test('«Calle San Vicente 40, 2º 14» → planta 2 y puerta 14', () => {
  const p = paramsDnploc('Calle San Vicente 40, 2º 14')
  assert.equal(p?.sigla, 'CL')
  assert.equal(p?.calle, 'SAN VICENTE')
  assert.equal(p?.numero, '40')
  assert.equal(p?.planta, '2')
  assert.equal(p?.puerta, '14')
})

test('«3º B» y «1º izquierda» siguen funcionando', () => {
  assert.equal(paramsDnploc('Avenida de Madrid 78, 3º B')?.puerta, 'B')
  assert.equal(paramsDnploc('C/ Sierpes 12, 1º izquierda')?.puerta, 'IZ')
})

test('sin ordinal no se confunde el portal con la puerta', () => {
  const p = paramsDnploc('Calle San Vicente 40')
  assert.equal(p?.puerta, null)
  assert.equal(p?.planta, null)
})
