// Coordenadas del Catastro (Consulta_CPMRC) + enlace a Google Maps.
// Los XML son respuestas REALES del servicio (30/07/2026) para la referencia
// del piso de El Puerto de Santa María de las alertas de Alberto. `node --test`.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parsearCoordenadas } from '../src/catastro.ts'
import { urlGoogleMaps } from '../src/geo.ts'

const XML_PUERTO = `<?xml version="1.0" encoding="utf-8"?>
<consulta_coordenadas xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns="http://www.catastro.meh.es/">
  <control>
    <cucoor>1</cucoor>
    <cuerr>0</cuerr>
  </control>
  <coordenadas>
    <coord>
      <pc>
        <pc1>8342605</pc1>
        <pc2>QA4584A</pc2>
      </pc>
      <geo>
        <xcen>-6.22492735770334</xcen>
        <ycen>36.5997022523672</ycen>
        <srs>EPSG:4326</srs>
      </geo>
      <ldt>CL VIRGEN MILAGROS 79 EL PUERTO DE SANTA MARIA (CÁDIZ)</ldt>
    </coord>
  </coordenadas>
</consulta_coordenadas>`

const XML_ERROR = `<?xml version="1.0" encoding="utf-8"?>
<consulta_coordenadas xmlns="http://www.catastro.meh.es/">
  <control>
    <cucoor>0</cucoor>
    <cuerr>1</cuerr>
  </control>
  <lerr>
    <err>
      <cod>9</cod>
      <des>LA REFERENCIA CATASTRAL NO EXISTE</des>
    </err>
  </lerr>
</consulta_coordenadas>`

test('REAL — coordenadas del piso de El Puerto de Santa María', () => {
  const c = parsearCoordenadas(XML_PUERTO)
  assert.ok(c)
  // xcen es la LONGITUD e ycen la LATITUD: si se cruzan, el piso cae en Somalia.
  assert.ok(Math.abs(c.lat - 36.5997) < 0.001, `lat ${c.lat}`)
  assert.ok(Math.abs(c.lon - -6.2249) < 0.001, `lon ${c.lon}`)
})

test('referencia inexistente → null, nunca un punto inventado', () => {
  assert.equal(parsearCoordenadas(XML_ERROR), null)
})

test('respuesta vacía o corrupta no revienta', () => {
  assert.equal(parsearCoordenadas(''), null)
  assert.equal(parsearCoordenadas('<geo><xcen>no</xcen><ycen>numérico</ycen></geo>'), null)
})

test('un (0,0) o un valor fuera de rango es dato corrupto', () => {
  assert.equal(parsearCoordenadas('<geo><xcen>0</xcen><ycen>0</ycen></geo>'), null)
  assert.equal(parsearCoordenadas('<geo><xcen>-6.2</xcen><ycen>136.6</ycen></geo>'), null)
})

test('el decimal con punto NO se trata como millar', () => {
  // El parser genérico del Catastro (numero()) quita puntos de millar; aquí
  // «-6.22» debe seguir siendo -6.22, no -622.
  const c = parsearCoordenadas('<geo><xcen>-6.22</xcen><ycen>36.59</ycen></geo>')
  assert.ok(c && c.lon === -6.22 && c.lat === 36.59)
})

test('urlGoogleMaps: la DIRECCIÓN manda sobre las coordenadas', () => {
  // Cambio deliberado (30/07/2026): `query=<lat,lon>` deja un pin anónimo en
  // mitad de la manzana, sin portal ni Street View — inservible para valorar el
  // inmueble. La dirección postal resuelve el portal exacto. Las coordenadas
  // siguen siendo el respaldo cuando no hay dirección (test siguiente).
  const u = urlGoogleMaps({ lat: 36.5997, lon: -6.2249, direccion: 'CL VIRGEN MILAGROS 79', municipio: 'El Puerto de Santa María' })
  assert.ok(u && !u.includes('36.5997'), u ?? 'sin url')
  assert.match(decodeURIComponent(u!), /CL VIRGEN MILAGROS 79, El Puerto de Santa María/)
})

test('urlGoogleMaps: sin dirección, las coordenadas son el respaldo', () => {
  const u = urlGoogleMaps({ lat: 36.5997, lon: -6.2249, municipio: 'El Puerto de Santa María' })
  assert.equal(u, 'https://www.google.com/maps/search/?api=1&query=36.5997,-6.2249')
})

test('urlGoogleMaps: sin coordenadas busca por dirección + municipio', () => {
  const u = urlGoogleMaps({ direccion: 'CL VIRGEN MILAGROS 79', municipio: 'El Puerto de Santa María', provincia: 'Cádiz' })
  assert.ok(u)
  assert.match(u, /^https:\/\/www\.google\.com\/maps\/search\/\?api=1&query=/)
  assert.match(decodeURIComponent(u), /VIRGEN MILAGROS 79, El Puerto de Santa María, Cádiz, España/)
})

test('urlGoogleMaps: solo municipio también vale (aproximado)', () => {
  const u = urlGoogleMaps({ municipio: 'Belmonte de Miranda', provincia: 'Asturias' })
  assert.ok(u && decodeURIComponent(u).includes('Belmonte de Miranda, Asturias, España'))
})

test('urlGoogleMaps: con SOLO provincia (o nada) no hay enlace', () => {
  assert.equal(urlGoogleMaps({ provincia: 'Sevilla' }), null)
  assert.equal(urlGoogleMaps({}), null)
  assert.equal(urlGoogleMaps({ direccion: '  ', municipio: null }), null)
})
