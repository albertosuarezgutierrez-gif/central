import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  nudosAKmh,
  parseTimestamp,
  normalizarGenerico,
  normalizarOsmAnd,
  normalizarTraccar,
  normalizarLectura,
} from '../src/ingest.ts'

test('nudosAKmh convierte nudos a km/h', () => {
  assert.equal(nudosAKmh(10), 18.52)
  assert.equal(nudosAKmh(0), 0)
})

test('parseTimestamp acepta epoch en segundos, ms e ISO', () => {
  assert.equal(parseTimestamp(1700000000), '2023-11-14T22:13:20.000Z')
  assert.equal(parseTimestamp(1700000000000), '2023-11-14T22:13:20.000Z')
  assert.equal(parseTimestamp('1700000000'), '2023-11-14T22:13:20.000Z')
  assert.equal(parseTimestamp('2023-11-14T22:13:20.000Z'), '2023-11-14T22:13:20.000Z')
})

test('parseTimestamp devuelve null si falta o es inválido', () => {
  assert.equal(parseTimestamp(null), null)
  assert.equal(parseTimestamp(''), null)
  assert.equal(parseTimestamp('no-es-fecha'), null)
})

test('normalizarGenerico mapea claves flexibles', () => {
  const l = normalizarGenerico({ deviceId: 'CAM-1', lat: 37.38, lng: -5.99, velocidadKmh: 50, rumbo: 90 })
  assert.deepEqual(l, { deviceId: 'CAM-1', lat: 37.38, lng: -5.99, capturadoAt: null, velocidadKmh: 50, rumbo: 90 })
  // alias latitude/longitude/id
  const l2 = normalizarGenerico({ id: 'X', latitude: 1, longitude: 2 })
  assert.equal(l2?.deviceId, 'X')
  assert.equal(l2?.lat, 1)
  assert.equal(l2?.lng, 2)
})

test('normalizarGenerico descarta payloads inválidos', () => {
  assert.equal(normalizarGenerico({ lat: 1, lng: 2 }), null) // sin deviceId
  assert.equal(normalizarGenerico({ deviceId: 'X', lat: 1 }), null) // sin lng
  assert.equal(normalizarGenerico({ deviceId: 'X', lat: 999, lng: 2 }), null) // fuera de rango
})

test('normalizarOsmAnd parsea query params y convierte velocidad de nudos', () => {
  const l = normalizarOsmAnd({ id: 'IMEI123', lat: '37.38', lon: '-5.99', speed: '10', bearing: '180', timestamp: '1700000000' })
  assert.equal(l?.deviceId, 'IMEI123')
  assert.equal(l?.lat, 37.38)
  assert.equal(l?.lng, -5.99)
  assert.equal(l?.velocidadKmh, 18.52) // 10 nudos
  assert.equal(l?.rumbo, 180)
  assert.equal(l?.capturadoAt, '2023-11-14T22:13:20.000Z')
})

test('normalizarOsmAnd descarta sin id', () => {
  assert.equal(normalizarOsmAnd({ lat: '1', lon: '2' }), null)
})

test('normalizarTraccar lee position/device anidados', () => {
  const l = normalizarTraccar({
    device: { uniqueId: 'TLT-9', name: 'Camión 9' },
    position: { latitude: 36.68, longitude: -6.13, speed: 20, course: 270, fixTime: '2024-01-01T10:00:00.000Z' },
  })
  assert.equal(l?.deviceId, 'TLT-9')
  assert.equal(l?.lat, 36.68)
  assert.equal(l?.lng, -6.13)
  assert.equal(l?.velocidadKmh, 37.04) // 20 nudos
  assert.equal(l?.rumbo, 270)
  assert.equal(l?.capturadoAt, '2024-01-01T10:00:00.000Z')
})

test('normalizarLectura despacha por formato', () => {
  assert.equal(normalizarLectura('osmand', { id: 'A', lat: '1', lon: '2' })?.deviceId, 'A')
  assert.equal(normalizarLectura('traccar', { device: { uniqueId: 'B' }, position: { latitude: 1, longitude: 2 } })?.deviceId, 'B')
  assert.equal(normalizarLectura('generico', { deviceId: 'C', lat: 1, lng: 2 })?.deviceId, 'C')
  assert.equal(normalizarLectura('generico', {}), null)
})
