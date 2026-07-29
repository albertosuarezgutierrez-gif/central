import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { slugDistritoFotocasa, slugNucleoPlaya, slugZonaFotocasa } from '../src/zona.ts'

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

test('distrito de capital: nombre del portal → slug de zona', () => {
  assert.equal(slugDistritoFotocasa('Cerro - Amate'), 'cerro-amate')
  assert.equal(slugDistritoFotocasa('Casco Antiguo'), 'casco-antiguo')
  assert.equal(slugDistritoFotocasa(null), null)
})

test('nucleo de playa citado en municipio o descripcion → slug propio', () => {
  assert.equal(slugNucleoPlaya('ALMONTE', 'Apartamento en MATALASCAÑAS, sector A'), 'matalascanas')
  assert.equal(slugNucleoPlaya('LEPE', 'vivienda en La Antilla, primera línea'), 'la-antilla')
  assert.equal(slugNucleoPlaya('Moguer', 'urbana en el término, paraje Mazagón'), 'mazagon')
  assert.equal(slugNucleoPlaya('SEVILLA', 'piso en calle Candeletas'), null)
})
