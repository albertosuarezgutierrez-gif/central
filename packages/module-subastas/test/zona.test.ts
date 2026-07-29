import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { slugZonaFotocasa } from '../src/zona.ts'

test('capital de provincia lleva sufijo -capital', () => {
  assert.equal(slugZonaFotocasa('SEVILLA'), 'sevilla-capital')
  assert.equal(slugZonaFotocasa('Cádiz'), 'cadiz-capital')
})

test('municipio normal: minúsculas, sin tildes, guiones', () => {
  assert.equal(slugZonaFotocasa('Sanlúcar de Barrameda'), 'sanlucar-de-barrameda')
  assert.equal(slugZonaFotocasa('PUNTA UMBRÍA'), 'punta-umbria')
  assert.equal(slugZonaFotocasa('El Puerto de Santa María'), 'el-puerto-de-santa-maria')
})

test('signos raros no cuelan en el slug', () => {
  assert.equal(slugZonaFotocasa('Écija (Sevilla)'), 'ecija-sevilla')
})

test('sin municipio utilizable → null, nunca se inventa', () => {
  assert.equal(slugZonaFotocasa(null), null)
  assert.equal(slugZonaFotocasa(''), null)
  assert.equal(slugZonaFotocasa('ab'), null)
})
