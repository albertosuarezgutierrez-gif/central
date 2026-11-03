import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  encajaCasaVacacional,
  encajaSubastaCasaVacacional,
  fusionarAvisadas,
} from '../src/perfil-casa-vacacional.ts'
import type { SubastaInmueble } from '../src/types.ts'

const buena = { precio: 250_000, tipo: 'chalet', dormitorios: 4, banos: 2, piscina: true, parcelaM2: null, municipio: 'Bormujos' }

test('cumple: chalet con piscina en Bormujos a 250.000 €', () => {
  const r = encajaCasaVacacional(buena)
  assert.equal(r.encaja, true)
  assert.deepEqual(r.pendientes, [])
})

test('cumple con parcela grande aunque no conste piscina; municipio sin tildes', () => {
  const r = encajaCasaVacacional({ ...buena, piscina: null, parcelaM2: 1200, municipio: 'HUEVAR DEL ALJARAFE' })
  assert.equal(r.encaja, true)
  assert.deepEqual(r.pendientes, [])
})

test('no cumple: piso, caro, municipio fuera, pocos dormitorios, pocos baños', () => {
  assert.equal(encajaCasaVacacional({ ...buena, tipo: 'piso' }).encaja, false)
  assert.equal(encajaCasaVacacional({ ...buena, precio: 280_001 }).encaja, false)
  assert.equal(encajaCasaVacacional({ ...buena, municipio: 'Sevilla' }).encaja, false)
  assert.equal(encajaCasaVacacional({ ...buena, dormitorios: 2 }).encaja, false)
  assert.equal(encajaCasaVacacional({ ...buena, banos: 1 }).encaja, false)
})

test('no cumple: consta sin piscina Y parcela pequeña; con parcela desconocida queda pendiente', () => {
  assert.equal(encajaCasaVacacional({ ...buena, piscina: false, parcelaM2: 300 }).encaja, false)
  const r = encajaCasaVacacional({ ...buena, piscina: false, parcelaM2: null })
  assert.equal(r.encaja, true)
  assert.deepEqual(r.pendientes, ['piscina o parcela'])
})

test('dato ausente NO descarta: queda pendiente', () => {
  const r = encajaCasaVacacional({ municipio: 'Almonte' })
  assert.equal(r.encaja, true)
  assert.deepEqual(r.pendientes, ['precio', 'tipo (casa/chalet)', 'dormitorios', 'baños', 'piscina o parcela'])
})

test('parcela/finca no es casa; tipo «otro» es desconocido', () => {
  assert.equal(encajaCasaVacacional({ ...buena, tipo: 'parcela' }).encaja, false)
  assert.equal(encajaCasaVacacional({ ...buena, tipo: 'otro' }).encaja, true)
})

const sub = (o: Partial<SubastaInmueble>): SubastaInmueble => ({
  dedupeKey: 'k1', fuente: 'boe', tipo: 'judicial', municipio: 'Pilas', provincia: 'Sevilla',
  descripcion: 'Chalet unifamiliar con piscina en Pilas', tipoBien: 'vivienda',
  valorSubasta: 200_000, dormitorios: 4, banos: 2, ...o,
} as SubastaInmueble)

test('subasta: casa con piscina en Pilas encaja', () => {
  assert.equal(encajaSubastaCasaVacacional(sub({})).encaja, true)
})

test('subasta: sin valor publicado queda pendiente (no descarta); por encima del tope descarta', () => {
  const r = encajaSubastaCasaVacacional(sub({ valorSubasta: null }))
  assert.equal(r.encaja, true)
  assert.ok(r.pendientes.includes('precio'))
  assert.equal(encajaSubastaCasaVacacional(sub({ valorSubasta: 300_000 })).encaja, false)
})

test('subasta: piso o municipio fuera no encajan', () => {
  assert.equal(encajaSubastaCasaVacacional(sub({ descripcion: 'Piso 2º puerta B con piscina comunitaria', planta: '2' })).encaja, false)
  assert.equal(encajaSubastaCasaVacacional(sub({ municipio: 'Lugo', provincia: 'Lugo' })).encaja, false)
})

test('fusionarAvisadas deduplica y acota', () => {
  assert.deepEqual(fusionarAvisadas(['a', 'b'], ['b', 'c']), ['a', 'b', 'c'])
  assert.deepEqual(fusionarAvisadas(['a', 'b', 'c'], ['d'], 3), ['b', 'c', 'd'])
})
