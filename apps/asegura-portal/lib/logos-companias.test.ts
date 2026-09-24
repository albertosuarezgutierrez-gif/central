import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

import { logoCompania } from './logos-companias.ts'

const PUBLIC = fileURLToPath(new URL('../public', import.meta.url))

test('casa por la primera palabra, sin mayúsculas ni tildes', () => {
  assert.equal(logoCompania('Occident'), '/logos/occident.svg')
  assert.equal(logoCompania('  ALLIANZ Seguros '), '/logos/allianz.svg')
  assert.equal(logoCompania('Reale Seguros Generales'), '/logos/reale.svg')
})

test('sin logo conocido → null (la pantalla pinta la inicial, no esconde la compañía)', () => {
  assert.equal(logoCompania('Helvetia'), null)
  assert.equal(logoCompania(''), null)
})

test('cada logo apunta a un fichero que existe (un <img> roto no falla: se ve roto)', () => {
  for (const n of ['allianz', 'asisa', 'fidelidade', 'generali', 'mapfre', 'occident', 'reale']) {
    const ruta = logoCompania(n)
    assert.ok(ruta, n)
    assert.ok(existsSync(`${PUBLIC}${ruta}`), `falta public${ruta}`)
  }
})
