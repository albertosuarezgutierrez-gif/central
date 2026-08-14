import { test } from 'node:test'
import assert from 'node:assert/strict'
import { esAnuncioPropio, normalizarNombre } from './mercado-propios.ts'

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
