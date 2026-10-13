import { test } from 'node:test'
import assert from 'node:assert/strict'
import { faltaCodigoPostal, ramoPideCpDelTomador } from './variantes-riesgo.ts'

// Código postal del tomador como dato que falta para cotizar (13/10/2026).

test('CP del tomador: auto y moto lo sacan de su ficha; hogar (CP de la vivienda), vida, salud y decesos no', () => {
  assert.ok(ramoPideCpDelTomador('auto'))
  assert.ok(ramoPideCpDelTomador('moto'))
  for (const r of ['hogar', 'vida', 'salud', 'decesos', 'comercio', 'rc']) assert.equal(ramoPideCpDelTomador(r), false, r)
})

test('CP: falta si no hay 5 dígitos; sin leer la ficha no se afirma (null)', () => {
  assert.equal(faltaCodigoPostal('41003'), false)
  assert.equal(faltaCodigoPostal(' 41003 '), false)
  assert.equal(faltaCodigoPostal(null), true)
  assert.equal(faltaCodigoPostal(''), true)
  assert.equal(faltaCodigoPostal('4100'), true, 'el vendor no admite un CP de 4 cifras')
  assert.equal(faltaCodigoPostal('Sevilla'), true)
  assert.equal(faltaCodigoPostal(undefined), null, 'no mirado ≠ no hay')
})
