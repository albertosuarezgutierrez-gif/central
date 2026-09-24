import assert from 'node:assert/strict'
import { test } from 'node:test'
import { barrioDesdeTitulo, comparablesDesdeMcpIdealista } from '../src/idealista-mcp.ts'
import { esCasa } from '../src/comparables.ts'
import { esZonaPreferente } from '../src/costa-norte.ts'

// Anuncios REALES del conector (search_properties, 24/09/2026), recortados a
// los campos que se usan. No son fixtures escritos a mano: la forma del título
// de Matalascañas («…, Almonte») es justo la que rompía la zona.
const MATALASCANAS = [
  {
    propertyCode: '110712997', price: 259000, size: 111, rooms: 4, priceByArea: 2333, status: 'good',
    latitude: 36.9924362, longitude: -6.5441643,
    suggestedTexts: { title: 'Chalet adosado en Sector p, 19 a, Zona Caño Guerrero, Almonte', subtitle: '' },
    detailedType: { typology: 'chalet', subTypology: 'terracedHouse' },
  },
  {
    propertyCode: '39679049', price: 379000, size: 400, rooms: 7, priceByArea: 948, status: 'good',
    latitude: 37.0039414, longitude: -6.5636374,
    suggestedTexts: { title: 'Chalet adosado en Sector C, Centro, Almonte', subtitle: '' },
    detailedType: { typology: 'chalet', subTypology: 'terracedHouse' },
  },
]
const ISLANTILLA = {
  propertyCode: '110709609', price: 185000, size: 68, rooms: 3, priceByArea: 2721, status: 'good',
  latitude: 37.2112431, longitude: -7.2453481,
  suggestedTexts: { title: 'Chalet adosado en Avenida del Deporte, Islantilla Golf, Islantilla', subtitle: 'Islantilla, Huelva' },
  detailedType: { typology: 'chalet', subTypology: 'terracedHouse' },
}
const SEVILLA_CENTRO = {
  propertyCode: '108111412', price: 670000, size: 172, rooms: 5, priceByArea: 3895, status: 'renew',
  latitude: 37.3889666, longitude: -5.9880791,
  suggestedTexts: { title: 'Piso en Santa Cruz - Alfalfa, Sevilla', subtitle: 'Centro' },
  detailedType: { typology: 'flat' },
}

test('la zona sale del núcleo buscado, no del municipio del título (Matalascañas ≠ Almonte)', () => {
  const { comparables } = comparablesDesdeMcpIdealista(MATALASCANAS, 'Matalascañas')
  assert.deepEqual(comparables.map((c) => c.zona), ['Zona Caño Guerrero, Matalascañas', 'Centro, Matalascañas'])
  for (const c of comparables) assert.ok(esZonaPreferente(c.zona, c.titulo), `${c.zona} debe ser preferente`)
})

test('el título es el del portal: la lente de casas lo reconoce', () => {
  const { comparables } = comparablesDesdeMcpIdealista([ISLANTILLA], 'Islantilla')
  const [c] = comparables
  assert.equal(c.titulo, 'Chalet adosado en Avenida del Deporte, Islantilla Golf, Islantilla')
  assert.ok(esCasa(c.titulo))
  assert.equal(c.tipo, 'vivienda')
  assert.equal(c.zona, 'Islantilla Golf, Islantilla')
  assert.equal(c.precioM2, 2721)
  assert.equal(c.habitaciones, 3)
  assert.equal(c.url, 'https://www.idealista.com/inmueble/110709609/')
  assert.equal(c.aReformar, false)
})

test('un anuncio de otro mercado se descarta, no contamina la mediana del núcleo', () => {
  const r = comparablesDesdeMcpIdealista([ISLANTILLA, SEVILLA_CENTRO], 'Islantilla')
  assert.deepEqual(r.comparables.map((c) => c.refAnuncio), ['110709609'])
  assert.deepEqual(r.fueraDeZona, ['108111412'])
})

test('sin coordenadas no se da por bueno', () => {
  const r = comparablesDesdeMcpIdealista([{ ...ISLANTILLA, latitude: null, longitude: null }], 'Islantilla')
  assert.equal(r.comparables.length, 0)
  assert.deepEqual(r.fueraDeZona, ['110709609'])
})

test('status renew → a reformar; sin status → no se sabe', () => {
  const r = comparablesDesdeMcpIdealista([{ ...ISLANTILLA, status: 'renew' }], 'Islantilla')
  assert.equal(r.comparables[0].aReformar, true)
  const s = comparablesDesdeMcpIdealista([{ ...ISLANTILLA, status: null }], 'Islantilla')
  assert.equal(s.comparables[0].aReformar, null)
})

test('núcleo sin centro de búsqueda → error ruidoso, no un corpus mal zonificado', () => {
  assert.throws(() => comparablesDesdeMcpIdealista([ISLANTILLA], 'Villanueva del Nada'), /sin centro/)
})

test('duplicados y precios basura fuera', () => {
  const r = comparablesDesdeMcpIdealista([ISLANTILLA, ISLANTILLA, { ...ISLANTILLA, propertyCode: '1', price: 0 }], 'Islantilla')
  assert.equal(r.comparables.length, 1)
})

test('barrioDesdeTitulo: solo con 3+ tramos', () => {
  assert.equal(barrioDesdeTitulo('Piso en Calle Amargura, Feria, Sevilla'), 'Feria')
  assert.equal(barrioDesdeTitulo('Chalet en Avenida X, Almonte'), null)
  assert.equal(barrioDesdeTitulo('Chalet en Islantilla'), null)
  assert.equal(barrioDesdeTitulo(null), null)
})

test('la bajada que declara el portal se conserva (entra ya rebajado)', () => {
  const rebajado = { ...MATALASCANAS[0], priceInfo: { price: { priceDropInfo: { formerPrice: 279000 } } } }
  const [c] = comparablesDesdeMcpIdealista([rebajado], 'Matalascañas').comparables
  assert.equal(c.precioAnteriorPortal, 279000)
  const [sin] = comparablesDesdeMcpIdealista([MATALASCANAS[0]], 'Matalascañas').comparables
  assert.equal(sin.precioAnteriorPortal, null)
  // Un «formerPrice» por debajo del precio actual no es una bajada.
  const subida = { ...MATALASCANAS[0], priceInfo: { price: { priceDropInfo: { formerPrice: 200000 } } } }
  assert.equal(comparablesDesdeMcpIdealista([subida], 'Matalascañas').comparables[0].precioAnteriorPortal, null)
})
