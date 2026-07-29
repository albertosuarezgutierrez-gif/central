import assert from 'node:assert/strict'
import { test } from 'node:test'
import { datosFichaFotocasa, esAlertaFotocasa, parsearAlertaFotocasa } from '../src/fotocasa.ts'
import { FIXTURE_FOTOCASA_1CARD, FIXTURE_FOTOCASA_2CARDS } from './fixtures-fotocasa.ts'

test('detecta el remitente de Fotocasa', () => {
  assert.ok(esAlertaFotocasa('enviosfotocasa@fotocasa.es'))
  assert.equal(esAlertaFotocasa('noticias@idealista.com'), false)
})

test('alerta multi-anuncio real: precio, tipo, zona, habs, m² y URL por tarjeta', () => {
  const cards = parsearAlertaFotocasa(FIXTURE_FOTOCASA_2CARDS)
  assert.equal(cards.length, 2)

  const [a, b] = cards
  assert.equal(a.portal, 'fotocasa')
  assert.equal(a.precio, 345000)
  assert.equal(a.tipo, 'vivienda') // «casa-chalet»
  assert.equal(a.zona, 'Calle Alonso de Ercilla, Huelva')
  assert.equal(a.habitaciones, 5)
  assert.equal(a.superficie, 260)
  assert.equal(a.precioM2, Math.round(345000 / 260))
  assert.match(a.url ?? '', /190167205\/d$/)
  assert.equal(a.refAnuncio, '190167205')

  assert.equal(b.precio, 176900)
  assert.equal(b.zona, 'Calle Cine Victoria, Isla Cristina')
  assert.equal(b.superficie, 115)
  assert.equal(b.refAnuncio, '188927148')
})

test('alerta de 1 anuncio (Matalascañas → municipio Almonte)', () => {
  const cards = parsearAlertaFotocasa(FIXTURE_FOTOCASA_1CARD)
  assert.equal(cards.length, 1)
  assert.equal(cards[0].precio, 220000)
  assert.equal(cards[0].tipo, 'vivienda') // «piso»
  assert.equal(cards[0].zona, 'Almonte')
  assert.equal(cards[0].habitaciones, 3)
  assert.equal(cards[0].superficie, 81)
  assert.equal(cards[0].refAnuncio, '190289724')
})

test('ficha: agencia identificada (fragmento real de la ficha de Almonte)', () => {
  // Fragmento del JSON embebido en la página del anuncio 190289724 (29/07/2026).
  const html = '"buildingType":"Flat","clientAlias":"INMOBILIARIA SEVILLA 2000","clientContactEmail":"","clientEmail":"","clientId":500180021545,"clientName":"GRUPO INMOBILIARIO SEVILLA 2000 S.L.","clientUrl":"/es/inmobiliaria-inmobiliaria-sevilla-2000/comprar/inmuebles/espana/todas-las-zonas/l?clientId=500180021545","clientTypeId":3,"contactName":"GRUPO INMOBILIARIO SEVILLA 2000 S.L.","coordinates":{"latitude":36.99217,"longitude":-6.540967,"accuracy":0}'
  const f = datosFichaFotocasa(html)
  assert.equal(f.anunciante, 'INMOBILIARIA SEVILLA 2000')
  assert.equal(f.esParticular, false)
  assert.equal(f.clientTipoId, 3)
  assert.equal(f.lat, 36.99217)
  assert.equal(f.lng, -6.540967)
})

test('ficha: sin alias ni nombre de cliente → particular; sin bloque → null', () => {
  const particular = datosFichaFotocasa('"clientAlias":"","clientName":"","clientTypeId":4')
  assert.equal(particular.esParticular, true)
  assert.equal(particular.anunciante, null)

  const sinDatos = datosFichaFotocasa('<html><body>pagina sin json</body></html>')
  assert.equal(sinDatos.esParticular, null)
})
