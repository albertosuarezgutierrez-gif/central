// Tests del helper nombrePorEan (Open Food Facts). PURO: fetch inyectable.
// Runner de Node (type-stripping): `node --test test/*.test.ts`.

import { test } from 'node:test'
import assert from 'node:assert/strict'

import { nombrePorEan } from '../src/lib/recepcion-ean.ts'

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
