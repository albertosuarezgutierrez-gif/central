import { test } from 'node:test'
import assert from 'node:assert/strict'
import { analizarCompetencia, type ComparableVecino } from './competencia.ts'

/** Los 10 comparables de 4 plazas medidos en Conil el 27/08/2026 (28-30 ago, 2 noches). */
const CONIL_AFORO_4: ComparableVecino[] = [
  { nombre: 'hotel apartamentos turisticos san vicente', precioNoche: 260, nota: 7.9, resenas: 371 },
  { nombre: 'La Jábega by Conil Home', precioNoche: 345, nota: 9, resenas: 355 },
  { nombre: 'Apartamento Luz de Conil', precioNoche: 275.52, nota: 9.6, resenas: 54 },
  { nombre: 'Apartamentovistasconil', precioNoche: 329, nota: null, resenas: null },
  { nombre: 'Beach & River', precioNoche: 355.775, nota: 8.7, resenas: 68 },
  { nombre: 'Apartamento la Bodega', precioNoche: 457.65, nota: 10, resenas: 1 },
  { nombre: 'La Boutique del Mar', precioNoche: 336, nota: 8.2, resenas: 362 },
  { nombre: 'Apartamento Mediterraneo 105', precioNoche: 303.685, nota: 10, resenas: 1 },
  { nombre: 'Villa la Dehesa', precioNoche: 360, nota: 8.4, resenas: 188 },
  { nombre: 'Apartamento cerca de Tartessus', precioNoche: 294, nota: null, resenas: null },
]

/** Los 3 comparables de 10 plazas, misma ventana. */
const CONIL_AFORO_10: ComparableVecino[] = [
  { nombre: 'hotel apartamentos turisticos san vicente', precioNoche: 590, nota: 7.9, resenas: 371 },
  { nombre: 'Villa la Dehesa', precioNoche: 1100, nota: 8.4, resenas: 188 },
  { nombre: 'Casa Pepi Sánchez Conil', precioNoche: 665, nota: 9.2, resenas: 15 },
]

test('el mercado de aforo grande es MÁS FINO', () => {
  assert.equal(analizarCompetencia(CONIL_AFORO_4, 4).disponibles, 10)
  assert.equal(analizarCompetencia(CONIL_AFORO_10, 10).disponibles, 3)
})

test('…y sin embargo se paga MENOS por plaza: mercado fino ≠ mercado caro', () => {
  const c4 = analizarCompetencia(CONIL_AFORO_4, 4)
  const c10 = analizarCompetencia(CONIL_AFORO_10, 10)
  assert.equal(Math.round(c4.adrMediano! * 100) / 100, 332.5)
  assert.equal(Math.round(c10.adrMediano! * 100) / 100, 665)
  assert.equal(Math.round(c4.eurPorPlaza! * 100) / 100, 83.13)
  assert.equal(Math.round(c10.eurPorPlaza! * 100) / 100, 66.5)
  assert.ok(c10.eurPorPlaza! < c4.eurPorPlaza!, 'el hallazgo que decide entero vs segregado')
})

test('sin comparables no se afirma nada: todo null, y la rampa tampoco se inventa', () => {
  const vacio = analizarCompetencia([], 4)
  assert.equal(vacio.disponibles, 0)
  assert.equal(vacio.adrMediano, null)
  assert.equal(vacio.eurPorPlaza, null)
  assert.equal(vacio.notaMediana, null)
  assert.equal(vacio.rampaSugerida, null)
})

test('aforo 0 no divide entre cero', () => {
  assert.equal(analizarCompetencia(CONIL_AFORO_4, 0).eurPorPlaza, null)
})

test('los comparables sin precio no cuentan como precio 0', () => {
  const campo = analizarCompetencia(
    [{ nombre: 'sin precio', precioNoche: null, nota: 9, resenas: 10 }, CONIL_AFORO_4[0]],
    4,
  )
  assert.equal(campo.adrMediano, 260)
  assert.equal(campo.disponibles, 1)
})

test('vecinos fuertes (nota alta + muchas reseñas) → rampa alta', () => {
  const campo = analizarCompetencia(
    [
      { nombre: 'a', precioNoche: 300, nota: 9.2, resenas: 296 },
      { nombre: 'b', precioNoche: 300, nota: 9.3, resenas: 44 },
      { nombre: 'c', precioNoche: 300, nota: 9.1, resenas: 58 },
    ],
    4,
  )
  assert.equal(campo.rampaSugerida, 0.25)
  assert.match(campo.razonRampa, /consolidad/i)
})

test('vecinos flojos → rampa baja', () => {
  const campo = analizarCompetencia(
    [
      { nombre: 'a', precioNoche: 300, nota: 6.5, resenas: 3 },
      { nombre: 'b', precioNoche: 300, nota: 7, resenas: 2 },
    ],
    4,
  )
  assert.equal(campo.rampaSugerida, 0.15)
})

test('la nota mediana ignora a los vecinos sin nota (no los cuenta como 0)', () => {
  const campo = analizarCompetencia(CONIL_AFORO_4, 4)
  assert.ok(campo.notaMediana! >= 8, `nota mediana real: ${campo.notaMediana}`)
  assert.equal(campo.conNota, 8)
})
