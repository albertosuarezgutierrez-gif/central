import { test } from 'node:test'
import assert from 'node:assert/strict'
import { esAnuncioPropio, normalizarNombre, NOMBRE_PORTAL, ANUNCIOS_PROPIOS } from './mercado-propios.ts'

test('el anuncio propio tal y como lo publica Booking se detecta', () => {
  // Nombre EXACTO devuelto por el conector el 14/08/2026 en la ventana de aforo 12.
  assert.equal(esAnuncioPropio('HOUSE SEVILLANA 6 habitaciones'), true)
})

test('da igual el uso de mayúsculas, los acentos y la puntuación', () => {
  assert.equal(esAnuncioPropio('House Sevillána - 6 hab.'), true)
})

test('la competencia de la misma calle NO es un anuncio propio', () => {
  // Caso real del corpus: hay comparables legítimos en Calle Bustos Tavera, donde también están
  // dos de nuestros pisos. Descartarlos por el nombre de la calle adelgazaría el mercado real.
  assert.equal(esAnuncioPropio('Monkeys Apartments Casa Palacio Bustos Tavera'), false)
  assert.equal(esAnuncioPropio('Bustos Tavera Suite'), false)
})

test('un comparable cualquiera pasa', () => {
  assert.equal(esAnuncioPropio('Apartamentos Setas Center'), false)
  assert.equal(esAnuncioPropio('Casa Pizarro, by Homing U'), false)
})

test('un nombre vacío o de solo puntuación no se toma por propio', () => {
  assert.equal(esAnuncioPropio(''), false)
  assert.equal(esAnuncioPropio('  ---  '), false)
})

test('normalizarNombre colapsa acentos, mayúsculas y separadores', () => {
  assert.equal(normalizarNombre('  Nüa   Torreón, 3º  '), 'nua torreon 3')
})

// ─── Los tres pisos que faltaban (19/08/2026) ─────────────────────────────────────────────────

test('🪞 los CUATRO anuncios propios se reconocen, no solo House', () => {
  // Nombres EXACTOS devueltos por el conector el 19/08/2026 al medir el escaparate de cada piso.
  // Los tres últimos faltaban en la lista y llevaban días entrando como comparables de sí mismos.
  assert.equal(esAnuncioPropio('Busto Reform Apartamento Centro Sevilla Parking Netflix'), true)
  assert.equal(esAnuncioPropio('Luxury Busto Patio privado Centro'), true)
  assert.equal(esAnuncioPropio('Dúplex center'), true)
})

test('el nombre de portal de CADA piso se reconoce como propio (invariante de las dos listas)', () => {
  // Si alguien añade un piso a NOMBRE_PORTAL y se olvida de ANUNCIOS_PROPIOS, ese piso vuelve a
  // ser comparable de sí mismo. Exactamente lo que pasó con tres de los cuatro.
  for (const [propiedad, nombre] of Object.entries(NOMBRE_PORTAL)) {
    assert.equal(esAnuncioPropio(nombre), true, `${propiedad} (${nombre}) no se reconoce como propio`)
  }
  assert.ok(ANUNCIOS_PROPIOS.length >= Object.keys(NOMBRE_PORTAL).length)
})

test('la competencia de Bustos Tavera SIGUE pasando tras añadir los dos pisos de esa calle', () => {
  // El riesgo de añadir «busto reform» y «luxury busto» era descartar el mercado real de la zona.
  assert.equal(esAnuncioPropio('Monkeys Apartments Casa Palacio Bustos Tavera'), false)
  assert.equal(esAnuncioPropio('Apartamento de lujo en Bustos Tavera'), false)
  assert.equal(esAnuncioPropio('Duplex con terraza en Triana'), false)
})
