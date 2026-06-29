import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  haversineKm,
  rumbo,
  velocidadKmh,
  tieneSenal,
  ultimaPosicionPorVehiculo,
  dentroDeGeocerca,
  etaMin,
  kmDeTraza,
  progresoRuta,
  simularTrayecto,
} from '../src/geo.ts'
import type { Posicion, Ubicacion } from '../src/types.ts'

// Puntos de referencia
const sevilla = { lat: 37.3886, lng: -5.9823 }
const madrid = { lat: 40.4168, lng: -3.7038 }

test('haversineKm ~ Sevilla→Madrid ≈ 390 km', () => {
  const d = haversineKm(sevilla, madrid)
  assert.ok(d > 380 && d < 400, `esperado ~390, fue ${d}`)
  assert.equal(haversineKm(sevilla, sevilla), 0)
})

test('rumbo Sevilla→Madrid es hacia el NNE (0–90º)', () => {
  const b = rumbo(sevilla, madrid)
  assert.ok(b > 0 && b < 90, `rumbo fuera de rango: ${b}`)
})

test('velocidadKmh: 1 km en 60 s ≈ 60 km/h', () => {
  const a = { lat: 37.0, lng: -5.0 }
  const b = { lat: 37.0, lng: -5.0 + 0.011223 } // ~1 km al este
  const v = velocidadKmh(a, b, 60)
  assert.ok(v > 55 && v < 65, `esperado ~60, fue ${v}`)
  assert.equal(velocidadKmh(a, b, 0), 0)
})

test('tieneSenal: viva dentro del umbral, perdida fuera', () => {
  const ahora = '2026-06-29T10:00:30Z'
  const reciente: Posicion = { ...sevilla, capturadoAt: '2026-06-29T10:00:00Z' }
  const vieja: Posicion = { ...sevilla, capturadoAt: '2026-06-29T09:58:00Z' }
  assert.equal(tieneSenal(reciente, ahora, 60), true)
  assert.equal(tieneSenal(vieja, ahora, 60), false)
  assert.equal(tieneSenal(null, ahora), false)
})

test('ultimaPosicionPorVehiculo se queda con la más reciente por vehículo', () => {
  const rows = [
    { vehiculoId: 'v1', capturadoAt: '2026-06-29T10:00:00Z' },
    { vehiculoId: 'v1', capturadoAt: '2026-06-29T10:05:00Z' },
    { vehiculoId: 'v2', capturadoAt: '2026-06-29T09:00:00Z' },
  ]
  const m = ultimaPosicionPorVehiculo(rows)
  assert.equal(m.get('v1')?.capturadoAt, '2026-06-29T10:05:00Z')
  assert.equal(m.get('v2')?.capturadoAt, '2026-06-29T09:00:00Z')
  assert.equal(m.size, 2)
})

test('dentroDeGeocerca: dentro y fuera del radio', () => {
  const centro = { lat: 37.3886, lng: -5.9823 }
  const cerca = { lat: 37.389, lng: -5.9826 } // ~50 m
  const lejos = { lat: 37.40, lng: -5.99 }
  assert.equal(dentroDeGeocerca(cerca, centro, 200), true)
  assert.equal(dentroDeGeocerca(lejos, centro, 200), false)
})

test('etaMin: null sin velocidad; positivo con velocidad', () => {
  assert.equal(etaMin(sevilla, madrid, 0), null)
  const eta = etaMin(sevilla, madrid, 90)
  assert.ok(eta && eta > 200 && eta < 300, `eta inesperada: ${eta}`)
})

test('kmDeTraza suma los tramos', () => {
  const a = { lat: 37.0, lng: -5.0 }
  const b = { lat: 37.0, lng: -5.0 + 0.011223 }
  const c = { lat: 37.0, lng: -5.0 + 0.022446 }
  const km = kmDeTraza([a, b, c])
  assert.ok(km > 1.8 && km < 2.2, `esperado ~2 km, fue ${km}`)
  assert.equal(kmDeTraza([a]), 0)
})

test('progresoRuta: parada más cercana, siguiente y ETA', () => {
  const paradas: Ubicacion[] = [
    { lat: 37.0, lng: -5.0, nombre: 'A' },
    { lat: 37.1, lng: -5.0, nombre: 'B' },
    { lat: 37.2, lng: -5.0, nombre: 'C' },
  ]
  const pr = progresoRuta({ lat: 37.09, lng: -5.0 }, paradas, 30)
  assert.ok(pr)
  assert.equal(pr!.paradaIndex, 1)
  assert.equal(pr!.siguienteIndex, 2)
  assert.ok(pr!.etaMin && pr!.etaMin > 0)
  assert.equal(progresoRuta({ lat: 0, lng: 0 }, []), null)
})

test('simularTrayecto interpola y termina en la última parada', () => {
  const paradas = [
    { lat: 37.0, lng: -5.0 },
    { lat: 37.1, lng: -5.0 },
  ]
  const traza = simularTrayecto(paradas, 10)
  assert.equal(traza.length, 11) // 10 pasos + parada final
  assert.deepEqual(traza[traza.length - 1], paradas[1])
  assert.deepEqual(simularTrayecto([paradas[0]]), [paradas[0]])
})
