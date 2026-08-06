import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  centroBusquedaIdealista,
  comparablesDesdeApiIdealista,
  llamadasPermitidasIdealista,
  tipoDesdePropertyType,
  IDEALISTA_LIMITE_MENSUAL,
  IDEALISTA_MARGEN_MENSUAL,
} from '../src/idealista-api.ts'

// Respuesta con la forma real de la Search API v3.5 (campos que se usan).
const RESPUESTA = {
  total: 3,
  totalPages: 1,
  elementList: [
    {
      propertyCode: 112345678,
      price: 189000,
      propertyType: 'flat',
      size: 90,
      rooms: 3,
      priceByArea: 2100,
      address: 'Calle Ancha, 12',
      neighborhood: 'El Portil',
      district: null,
      municipality: 'Punta Umbría',
      province: 'Huelva',
      url: 'https://www.idealista.com/inmueble/112345678/',
    },
    {
      propertyCode: '112000001',
      price: 260000,
      propertyType: 'chalet',
      size: 140,
      rooms: 4,
      // Sin priceByArea: el €/m² se deriva de precio/superficie.
      address: '',
      neighborhood: null,
      district: 'Islantilla',
      municipality: 'Lepe',
    },
    {
      propertyCode: 112000002,
      price: 18000,
      propertyType: 'garage',
      size: 12,
      municipality: 'Sevilla',
      district: 'Sevilla',
    },
  ],
}

test('mapea la respuesta de la API al mismo Comparable que los correos', () => {
  const [piso, chalet, garaje] = comparablesDesdeApiIdealista(RESPUESTA)

  assert.equal(piso.portal, 'idealista')
  assert.equal(piso.refAnuncio, '112345678') // propertyCode = id de /inmueble/<id>/ → dedupe con las alertas
  assert.equal(piso.tipo, 'vivienda')
  assert.equal(piso.zona, 'El Portil, Punta Umbría')
  assert.equal(piso.precio, 189000)
  assert.equal(piso.superficie, 90)
  assert.equal(piso.habitaciones, 3)
  assert.equal(piso.precioM2, 2100) // el €/m² del portal manda sobre el derivado
  assert.equal(piso.url, 'https://www.idealista.com/inmueble/112345678/')
  assert.equal(piso.titulo, 'Vivienda en Calle Ancha, 12')

  assert.equal(chalet.zona, 'Islantilla, Lepe') // sin barrio cae al distrito
  assert.equal(chalet.precioM2, Math.round(260000 / 140)) // derivado al faltar priceByArea
  assert.equal(chalet.titulo, 'Vivienda en Islantilla, Lepe') // sin address usa la zona
  assert.equal(chalet.url, 'https://www.idealista.com/inmueble/112000001/')

  assert.equal(garaje.tipo, 'garaje')
  assert.equal(garaje.zona, 'Sevilla') // «Sevilla, Sevilla» se pliega a una
})

test('status de la API → aReformar: renew sí, good no, ausente «no se sabe»', () => {
  const [renew, good, sinStatus] = comparablesDesdeApiIdealista({
    elementList: [
      { propertyCode: 1, price: 90000, propertyType: 'flat', status: 'renew' },
      { propertyCode: 2, price: 90000, propertyType: 'flat', status: 'good' },
      { propertyCode: 3, price: 90000, propertyType: 'flat' },
    ],
  })
  assert.equal(renew.aReformar, true)
  assert.equal(good.aReformar, false)
  assert.equal(sinStatus.aReformar, null) // no se sabe ≠ buen estado
})

test('descarta anuncios sin ref o con precio no creíble', () => {
  const out = comparablesDesdeApiIdealista({
    elementList: [
      { propertyCode: '', price: 100000 },
      { propertyCode: 1, price: 500 }, // < 1000€: error del anuncio
      { propertyCode: 2, price: NaN as any },
    ],
  })
  assert.equal(out.length, 0)
  assert.deepEqual(comparablesDesdeApiIdealista({}), [])
})

test('propertyType → tipo, con desconocidos a «otro»', () => {
  assert.equal(tipoDesdePropertyType('penthouse'), 'vivienda')
  assert.equal(tipoDesdePropertyType('countryHouse'), 'vivienda')
  assert.equal(tipoDesdePropertyType('storageRoom'), 'garaje')
  assert.equal(tipoDesdePropertyType('premises'), 'local')
  assert.equal(tipoDesdePropertyType('land'), 'terreno')
  assert.equal(tipoDesdePropertyType('loquesea'), 'otro')
  assert.equal(tipoDesdePropertyType(null), 'otro')
})

test('centro de búsqueda: zonas vigiladas sí, desconocidas null (no se gasta cuota)', () => {
  const punta = centroBusquedaIdealista('Punta Umbría')
  assert.ok(punta && Math.abs(punta.lat - 37.181) < 0.01)
  // Insensible a acentos/mayúsculas, y casa dentro de un texto de zona más largo.
  assert.ok(centroBusquedaIdealista('MATALASCAÑAS'))
  assert.ok(centroBusquedaIdealista('El Portil, Cartaya'))
  assert.equal(centroBusquedaIdealista('Villaconejos de Trabaque'), null)
  assert.equal(centroBusquedaIdealista(null), null)
})

test('presupuesto mensual: raciona por pasada y respeta el margen', () => {
  assert.equal(llamadasPermitidasIdealista(0), 3)
  assert.equal(llamadasPermitidasIdealista(0, 2), 2)
  const techo = IDEALISTA_LIMITE_MENSUAL - IDEALISTA_MARGEN_MENSUAL // 85
  assert.equal(llamadasPermitidasIdealista(techo - 1), 1)
  assert.equal(llamadasPermitidasIdealista(techo), 0)
  assert.equal(llamadasPermitidasIdealista(techo + 50), 0) // nunca negativo
})
