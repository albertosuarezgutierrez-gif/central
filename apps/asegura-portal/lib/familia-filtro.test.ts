import { test } from 'node:test'
import assert from 'node:assert/strict'

import { familiaDeParametro, titularesDeFamilia } from './familia-filtro.ts'

test('familiaDeParametro: fuera de lista, vacío o repetido = sin filtro', () => {
  assert.equal(familiaDeParametro('personales'), 'personales')
  assert.equal(familiaDeParametro('patrimoniales'), 'patrimoniales')
  for (const v of ['x', '', undefined, ['personales'], 'PERSONALES', '__proto__']) assert.equal(familiaDeParametro(v as never), null)
})

test('titularesDeFamilia: el titular jurídico manda sobre el ramo', () => {
  const ts = [
    { tipoPersona: 'fisica', polizas: [{ ramo: 'salud' }, { ramo: 'hogar' }, { ramo: 'auto' }] },
    { tipoPersona: 'juridica', polizas: [{ ramo: 'salud' }] },
  ]
  assert.deepEqual(titularesDeFamilia(ts, 'personales').map((t) => t.polizas.length), [1, 0])
  assert.deepEqual(titularesDeFamilia(ts, 'patrimoniales').map((t) => t.polizas.length), [2, 0])
  assert.deepEqual(titularesDeFamilia(ts, 'empresa').map((t) => t.polizas.length), [0, 1])
  assert.deepEqual(titularesDeFamilia(ts, null).map((t) => t.polizas.length), [3, 1])
})
