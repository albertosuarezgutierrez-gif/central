import { test } from 'node:test'
import assert from 'node:assert/strict'
import { duermeEnGaraje, etiquetaGaraje, resolverGarajeEnCatalogo, rotuloGaraje } from './garajes.ts'

test('etiqueta y rótulo: en español; un código no visto se dice como código, nunca desnudo ni traducido', () => {
  assert.equal(etiquetaGaraje('PublicRoad'), 'En la vía pública')
  assert.equal(etiquetaGaraje('CommunalParking'), 'Garaje comunitario')
  assert.equal(etiquetaGaraje('Xyz'), null)
  assert.equal(rotuloGaraje('PublicRoad'), 'En la vía pública')
  assert.equal(rotuloGaraje('Xyz'), '«Xyz» (código de la compañía)')
  assert.equal(rotuloGaraje('  '), null)
  assert.equal(rotuloGaraje(null), null)
})

test('duermeEnGaraje: calle → false, garajes → true, vacío o no visto → null', () => {
  assert.equal(duermeEnGaraje('PublicRoad'), false)
  assert.equal(duermeEnGaraje('Street'), false)
  for (const g of ['CommunalParking', 'Garage', 'PrivateGarage', 'IndividualGarage']) assert.equal(duermeEnGaraje(g), true, g)
  assert.equal(duermeEnGaraje('Xyz'), null)
  assert.equal(duermeEnGaraje(''), null)
})

const CAT = [
  { id: 'Street', nombre: 'Calle' },
  { id: 'CommunalParking', nombre: 'Garaje colectivo' },
  { id: 'PrivateGarage', nombre: 'Garaje individual' },
]

test('resolver: mismo id, misma etiqueta, o equivalencia explícita con UNA sola opción de esa clase', () => {
  assert.equal(resolverGarajeEnCatalogo('CommunalParking', CAT), 'CommunalParking')
  assert.equal(resolverGarajeEnCatalogo('garaje individual', CAT), 'PrivateGarage', 'por etiqueta')
  assert.equal(resolverGarajeEnCatalogo('PublicRoad', CAT), 'Street', 'PublicRoad y Street son las dos «calle»')
  assert.equal(resolverGarajeEnCatalogo('IndividualGarage', CAT), 'PrivateGarage')
  // Por la etiqueta del catálogo aunque el id no se haya visto nunca.
  assert.equal(resolverGarajeEnCatalogo('PublicRoad', [{ id: 'X1', nombre: 'Vía pública' }, { id: 'X2', nombre: 'Garaje colectivo' }]), 'X1')
  // Un garaje guardado como texto.
  assert.equal(resolverGarajeEnCatalogo('En la vía pública', CAT), 'Street')
})

test('resolver: sin certeza → null (NUNCA el defecto)', () => {
  // Ninguna opción de la clase «calle».
  assert.equal(resolverGarajeEnCatalogo('PublicRoad', CAT.slice(1)), null)
  // Dos opciones de la misma clase: ambiguo.
  assert.equal(resolverGarajeEnCatalogo('PublicRoad', [...CAT, { id: 'Y', nombre: 'Vía pública' }]), null)
  // «Garaje» a secas no dice si es individual o comunitario.
  assert.equal(resolverGarajeEnCatalogo('Garage', CAT), null)
  // «Parking público» no es «calle».
  assert.equal(resolverGarajeEnCatalogo('PublicRoad', [{ id: 'P', nombre: 'Parking público' }]), null)
  // Id visto y nombre que lo contradice: esa opción no cuenta.
  assert.equal(resolverGarajeEnCatalogo('PublicRoad', [{ id: 'Street', nombre: 'Garaje colectivo' }]), null)
  // Código no visto, vacío, catálogo vacío.
  assert.equal(resolverGarajeEnCatalogo('Xyz', CAT), null)
  assert.equal(resolverGarajeEnCatalogo('', CAT), null)
  assert.equal(resolverGarajeEnCatalogo('PublicRoad', []), null)
})

test('resolver: «privado» no equivale a «individual» (un comunitario también es privado)', () => {
  // Ni el guardado como texto ni la opción del catálogo: sin certeza → null.
  assert.equal(resolverGarajeEnCatalogo('Garaje privado', CAT), null)
  assert.equal(resolverGarajeEnCatalogo('IndividualGarage', [{ id: 'X', nombre: 'Garaje privado' }, { id: 'Y', nombre: 'Garaje colectivo' }]), null)
  // «private» por id visto sigue valiendo (PrivateGarage es «Garaje individual» en la tabla).
  assert.equal(resolverGarajeEnCatalogo('IndividualGarage', [{ id: 'PrivateGarage', nombre: 'Garaje' }]), 'PrivateGarage')
})
