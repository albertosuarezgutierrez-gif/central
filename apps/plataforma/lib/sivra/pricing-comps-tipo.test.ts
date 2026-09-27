import { test } from 'node:test'
import assert from 'node:assert/strict'
import { esCasaComparable, sqlCompEsCasaComparable, PALABRAS_NO_CASA } from './pricing-comps-tipo.ts'

// Nombres REALES del corpus `market_rates` (guests=12, últimos 14 días, medido 19/09/2026) — no
// fixtures inventados. Los primeros son los que más pesan por frecuencia y NO son casas enteras.
test('descarta aparthoteles/hoteles reales que dominan el corpus por frecuencia', () => {
  assert.equal(esCasaComparable('Overland Suites Catedral'), false)
  assert.equal(esCasaComparable('Singular Corral de San José'), false)
  assert.equal(esCasaComparable('Puerta Principe Luxury Apartments'), false)
  assert.equal(esCasaComparable('GoToSeville FERIA APARTMENTS'), false)
  assert.equal(esCasaComparable('Sercotel Sevilla Guadalquivir Suites'), false)
  assert.equal(esCasaComparable('Morgado Suites'), false)
  assert.equal(esCasaComparable('Slow Suites Salvador'), false)
  assert.equal(esCasaComparable('NineSuites'), false)
  assert.equal(esCasaComparable('Apartamentos San Pedro'), false)
  assert.equal(esCasaComparable('Singular Metropol'), false)
  assert.equal(esCasaComparable('Welldone Cathedral Suites'), false)
  assert.equal(esCasaComparable('The Zentral Suites & Apartments'), false)
  assert.equal(esCasaComparable('Mercer Residences Sevilla'), false)
  assert.equal(esCasaComparable('Casa de la Moneda Residences Sevilla'), false)
})

test('descarta hoteles literales (marca internacional, sin "apartamento" en el nombre)', () => {
  assert.equal(esCasaComparable('Hilton Garden Inn Sevilla'), false)
  assert.equal(esCasaComparable('Melia Sevilla'), false)
  assert.equal(esCasaComparable('Hotel San Gil Sevilla'), false)
  assert.equal(esCasaComparable('Hotel Don Paco Sevilla'), false)
  assert.equal(esCasaComparable('Hoteles del Sur'), false)
})

test('deja pasar las casas enteras reales del corpus', () => {
  assert.equal(esCasaComparable('Cheerful 6 Bedroom House in Seville With Terraces'), true)
  assert.equal(esCasaComparable('Casa Sevillana'), true)
  assert.equal(esCasaComparable('Charming 6 Bed Sleeps 12 Andalusian House'), true)
  assert.equal(esCasaComparable('Villa Dársena'), true)
  assert.equal(esCasaComparable('A special house in the historic heart of Seville'), true)
  assert.equal(esCasaComparable('Beautiful house 6 bedrooms 7 bathrooms 2 terraces'), true)
  assert.equal(esCasaComparable('Otumba 22 House'), true)
  assert.equal(esCasaComparable('COPLA HOUSE SEVILLA'), true)
})

test('sin nombre (NULL) no se juzga: entra, como con la plausibilidad y la liga', () => {
  assert.equal(esCasaComparable(null), true)
  assert.equal(esCasaComparable(undefined), true)
})

test('la comparación ignora mayúsculas', () => {
  assert.equal(esCasaComparable('HOTEL DON PACO'), false)
  assert.equal(esCasaComparable('hotel don paco'), false)
})

test('sqlCompEsCasaComparable no interpola nada externo y usa el prefijo', () => {
  const sql = sqlCompEsCasaComparable('m.')
  assert.match(sql, /m\.comp_name/)
  assert.match(sql, /ILIKE ANY/)
  for (const p of PALABRAS_NO_CASA) assert.match(sql, new RegExp(`%${p}%`))
})

test('sqlCompEsCasaComparable sin prefijo usa la columna a secas', () => {
  const sql = sqlCompEsCasaComparable()
  assert.match(sql, /\(comp_name IS NULL/)
})
