import assert from 'node:assert/strict'
import { test } from 'node:test'
import { provinciaCanonica } from '../src/geo.ts'

test('unifica las formas que escriben las distintas fuentes', () => {
  // El caso real: el BOE manda «Sevilla» y la Junta «SEVILLA» — la calibración
  // las contaba como dos provincias y partía la muestra (5 + 4 en vez de 9).
  assert.equal(provinciaCanonica('Sevilla'), 'Sevilla')
  assert.equal(provinciaCanonica('SEVILLA'), 'Sevilla')
  assert.equal(provinciaCanonica('sevilla'), 'Sevilla')
  assert.equal(provinciaCanonica('  SEVILLA  '), 'Sevilla')
})

test('restituye las tildes que pierden algunas fuentes', () => {
  assert.equal(provinciaCanonica('CADIZ'), 'Cádiz')
  assert.equal(provinciaCanonica('CÁDIZ'), 'Cádiz')
  assert.equal(provinciaCanonica('almeria'), 'Almería')
  assert.equal(provinciaCanonica('JAEN'), 'Jaén')
  assert.equal(provinciaCanonica('MALAGA'), 'Málaga')
})

test('provincias de una sola forma pasan igual', () => {
  assert.equal(provinciaCanonica('Asturias'), 'Asturias')
  assert.equal(provinciaCanonica('GRANADA'), 'Granada')
  assert.equal(provinciaCanonica('Huelva'), 'Huelva')
})

test('vacío es null, y lo no reconocido se conserva (mejor sin unificar que perdido)', () => {
  assert.equal(provinciaCanonica(null), null)
  assert.equal(provinciaCanonica(''), null)
  assert.equal(provinciaCanonica('   '), null)
  assert.equal(provinciaCanonica('Comarca del Aljarafe'), 'Comarca del Aljarafe')
})
