// Coordenadas del Catastro (Consulta_CPMRC) + enlace a Google Maps.
// Los XML son respuestas REALES del servicio (30/07/2026) para la referencia
// del piso de El Puerto de Santa María de las alertas de Alberto. `node --test`.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parsearCoordenadas } from '../src/catastro.ts'
import { esDireccionPostal, urlGoogleMaps } from '../src/geo.ts'

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

// ── Prosa registral ≠ dirección postal (31/07/2026) ─────────────────────────
// El BOE saca la «dirección» de la descripción registral y a veces es un
// párrafo. Mandarlo a Google devuelve cualquier cosa, y hasta hoy lo hacía
// PISANDO unas coordenadas catastrales exactas: el mapa pintaba el pin bueno y
// el botón «Mapa» de la misma tarjeta llevaba a otro sitio.

test('esDireccionPostal: acepta direcciones reales del corpus', () => {
  for (const d of [
    'CL VIRGEN MILAGROS 79',
    'AV PEDRO ROMERO 2, 41007 SEVILLA',
    'CALLE ISAAC ALBÉNIZ, Nº 4, PLANTA BAJA, PUERTA DCHA, DE JAÉN',
    'AVDA. PABLO IGLESIAS, 24, DE ALMERÍA',
    'C/ PACO GANDÍA 26',
    // El BOE antepone el municipio a la vía con frecuencia.
    'Dos Hermanas, C/ castillo de la Serrezuela 12',
    'CAMINO DE LA ESTACIÓN S/N, DE ARCOS DE LA FRONTERA (CÁDIZ)',
  ]) {
    assert.equal(esDireccionPostal(d), true, d)
  }
})

test('esDireccionPostal: rechaza la prosa registral y lo que no ubica', () => {
  for (const d of [
    // Caso real del corpus: la «calle» aparece en mitad del párrafo.
    'Vivienda en planta primera tipo F, con acceso a través del portal desde la calle, Edificio Los Arcos',
    'URBANA. Participación indivisa de un cincuenta por ciento',
    // Sin vía reconocible: mejor el punto que ya tengamos.
    'Pumarada 3, Parroquia de San Bartolomé, Concejo de Belmonte de Miranda',
    // Polígono/parcela no resuelve en ningún buscador.
    'POLÍGONO 41 PARCELA 7, DE ÚBEDA (JAÉN)',
    // Vía sin número de portal.
    'CALLE ALCALDE ALONSO ARIAS DE HERRERA',
    '',
    null,
  ]) {
    assert.equal(esDireccionPostal(d), false, String(d))
  }
})

test('urlGoogleMaps: la prosa NO pisa unas coordenadas exactas', () => {
  const u = urlGoogleMaps({
    lat: 43.28, lon: -6.21,
    direccion: 'Vivienda en planta primera tipo F, con acceso a través del portal desde la calle',
    municipio: 'Belmonte de Miranda', provincia: 'Asturias',
  })
  assert.equal(u, 'https://www.google.com/maps/search/?api=1&query=43.28,-6.21')
})

test('urlGoogleMaps: sin coordenadas, la prosa tampoco se usa como dirección', () => {
  // Cae al municipio: un pin en el pueblo es honesto; buscar el párrafo, no.
  const u = urlGoogleMaps({ direccion: 'Vivienda en planta primera tipo F, con acceso desde la calle', municipio: 'Osuna', provincia: 'Sevilla' })
  assert.ok(u && decodeURIComponent(u).includes('Osuna, Sevilla, España'))
  assert.ok(!decodeURIComponent(u!).includes('Vivienda'))
})

test('parsearCoordenadas: un punto fuera de España es dato corrupto', () => {
  // El modo típico de equivocarse aquí es CRUZAR los ejes: con Sevilla
  // (37.4, -6.0) el cruce da (-6.0, 37.4) — válido como par lat/lon, pero en
  // Turquía. Se rechaza en vez de guardarlo como «ubicación exacta».
  assert.equal(parsearCoordenadas('<geo><xcen>37.38</xcen><ycen>-5.99</ycen></geo>'), null)
  assert.equal(parsearCoordenadas('<geo><xcen>2.35</xcen><ycen>48.85</ycen></geo>'), null)
  // Canarias y Ceuta SÍ están dentro de la caja.
  assert.ok(parsearCoordenadas('<geo><xcen>-15.43</xcen><ycen>28.11</ycen></geo>'))
  assert.ok(parsearCoordenadas('<geo><xcen>-5.32</xcen><ycen>35.89</ycen></geo>'))
})
