import { test } from 'node:test'
import assert from 'node:assert/strict'

import { capitalContinenteDeCartera, capitalContinenteDeDeclarada } from './capital-continente.ts'

test('cartera: solo la cobertura que ES el continente; los límites parciales no cuentan', () => {
  const c = { lista: ['Contenido', 'Continente', 'Daños por agua al continente', 'Robo del continente'], capitales: [30_000, 150_000, 6_000, 3_000] }
  assert.equal(capitalContinenteDeCartera(c), 15_000_000)
  assert.equal(capitalContinenteDeCartera({ lista: ['Edificación: incendio'], capitales: [200_000.5] }), 20_000_050)
  assert.equal(capitalContinenteDeCartera({ lista: ['Daños por agua al continente'], capitales: [6_000] }), null)
})

test('🚨 null = no se sabe: sin coberturas, sin capitales, ilimitado, 0, o dos continentes distintos', () => {
  assert.equal(capitalContinenteDeCartera(null), null)
  assert.equal(capitalContinenteDeCartera({ lista: ['Continente'] }), null)
  assert.equal(capitalContinenteDeCartera({ lista: ['Continente'], capitales: [null] }), null)
  assert.equal(capitalContinenteDeCartera({ lista: ['Continente'], capitales: ['ilimitado'] }), null)
  assert.equal(capitalContinenteDeCartera({ lista: ['Continente'], capitales: [0] }), null)
  assert.equal(capitalContinenteDeCartera({ lista: ['Continente', 'Edificio'], capitales: [100_000, 120_000] }), null)
  // Dos filas con el MISMO capital no son ambiguas.
  assert.equal(capitalContinenteDeCartera({ lista: ['Continente', 'Edificio'], capitales: [100_000, 100_000] }), 10_000_000)
})

test('declarada: número o texto numérico en euros; lo demás es null (no 0)', () => {
  assert.equal(capitalContinenteDeDeclarada({ capitalContinente: 120000 }), 12_000_000)
  assert.equal(capitalContinenteDeDeclarada({ capitalContinente: '120000,50' }), 12_000_050)
  for (const malo of [{}, { capitalContinente: 0 }, { capitalContinente: 'mucho' }, { capitalContinente: -5 }, null, [], 'x']) {
    assert.equal(capitalContinenteDeDeclarada(malo), null, JSON.stringify(malo))
  }
})
