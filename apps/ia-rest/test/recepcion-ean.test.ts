// Tests del helper nombrePorEan (Open Food Facts). PURO: fetch inyectable.
// Runner de Node (type-stripping): `node --test test/*.test.ts`.

import { test } from 'node:test'
import assert from 'node:assert/strict'

import { nombrePorEan, eanValido } from '../src/lib/recepcion-ean.ts'

test('eanValido acepta EAN-13 y EAN-8 con dígito de control correcto', () => {
  assert.equal(eanValido('8480000180186'), true) // EAN-13 (atún Hacendado)
  assert.equal(eanValido('96385074'), true)        // EAN-8
})

test('eanValido rechaza lecturas basura del escáner', () => {
  // Códigos reales que el escáner metía como filas duplicadas (foto de Catering JJ).
  // El checksum atrapa la mayoría; los que por coincidencia son válidos (p. ej.
  // "84800008" es un EAN-8 estructuralmente correcto) los filtra la confirmación
  // multi-frame del visor, no este validador.
  assert.equal(eanValido('40044080'), false)
  assert.equal(eanValido('42066080'), false)
  assert.equal(eanValido('42044080'), false)
  assert.equal(eanValido('123'), false)        // longitud inválida
  assert.equal(eanValido('abcdefgh'), false)   // no numérico
})

test('nombrePorEan combina nombre y marca', async () => {
  const fakeFetch = (async () => ({ ok: true, json: async () => ({ status: 1, product: { product_name_es: 'Atún claro', brands: 'Hacendado' } }) })) as unknown as typeof fetch
  assert.equal(await nombrePorEan('8480000180186', fakeFetch), 'Atún claro (Hacendado)')
})

test('nombrePorEan no duplica la marca si ya está en el nombre', async () => {
  const fakeFetch = (async () => ({ ok: true, json: async () => ({ status: 1, product: { product_name: 'Hacendado Atún', brands: 'Hacendado' } }) })) as unknown as typeof fetch
  assert.equal(await nombrePorEan('123', fakeFetch), 'Hacendado Atún')
})

test('nombrePorEan devuelve null si el producto no existe', async () => {
  const fakeFetch = (async () => ({ ok: true, json: async () => ({ status: 0 }) })) as unknown as typeof fetch
  assert.equal(await nombrePorEan('0000', fakeFetch), null)
})

test('nombrePorEan devuelve null ante error de red', async () => {
  const fakeFetch = (async () => { throw new Error('network') }) as unknown as typeof fetch
  assert.equal(await nombrePorEan('123', fakeFetch), null)
})
