import test from 'node:test'
import assert from 'node:assert/strict'
import { RAMOS_OPORTUNIDAD } from './oportunidad-seguimiento.ts'
import { TIPOS_SEGURO } from './emision.ts'
import { RAMOS } from './filtro-cartera.ts'
import { ramoOfertaDe } from './coberturas-taxonomia.ts'

// Los ramos viven copiados en varios sitios (enum de BD, emisión, filtro de cartera): un ramo nuevo
// de oportunidad que falte en una copia se descarta en silencio. Este cepo lo grita.
test('TIPOS_SEGURO contiene todos los RAMOS_OPORTUNIDAD (y viceversa)', () => {
  assert.deepEqual([...TIPOS_SEGURO].sort(), [...RAMOS_OPORTUNIDAD].sort())
})

test('el filtro de cartera ofrece todos los RAMOS_OPORTUNIDAD', () => {
  const v = new Set<string>(RAMOS.map((r) => r.v))
  for (const r of RAMOS_OPORTUNIDAD) assert.ok(v.has(r), `filtro-cartera RAMOS sin «${r}»`)
  assert.equal(v.size, RAMOS_OPORTUNIDAD.length)
})

test('ramoOfertaDe: empresas se compara como comercio', () => {
  assert.equal(ramoOfertaDe('empresas'), 'comercio')
  assert.equal(ramoOfertaDe('viaje'), 'generico')
})
