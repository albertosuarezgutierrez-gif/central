// Tests de la lógica PURA del radar PLACSP (F7).
// Runner integrado de Node (type-stripping): `node --test`.
import { test } from 'node:test'
import assert from 'node:assert/strict'

import { coincideRadar } from '../src/radar.ts'
import type { AnuncioRadar, CriteriosRadar } from '../src/types.ts'

const LIMPIEZA: AnuncioRadar = {
  titulo: 'Servicio de limpieza de colegios',
  objeto: 'Limpieza integral de centros educativos',
  cpv: ['90910000'],
  presupuesto: 120000,
}

test('coincideRadar: casa por CPV (prefijo) y palabra clave', () => {
  const crit: CriteriosRadar = { cpv: ['9091'], palabras_clave: ['limpieza'] }
  const r = coincideRadar(LIMPIEZA, crit)
  assert.equal(r.coincide, true)
  assert.ok(r.puntuacion > 0)
  assert.ok(r.motivos.some(m => /CPV/i.test(m)))
  assert.ok(r.motivos.some(m => /limpieza/i.test(m)))
})

test('coincideRadar: descarta por presupuesto fuera de rango', () => {
  const crit: CriteriosRadar = { palabras_clave: ['limpieza'], presupuesto_max: 50000 }
  const r = coincideRadar(LIMPIEZA, crit)
  assert.equal(r.coincide, false)
  assert.ok(r.motivos.some(m => /presupuesto/i.test(m)))
})

test('coincideRadar: sin coincidencias no casa', () => {
  const crit: CriteriosRadar = { cpv: ['4500'], palabras_clave: ['obra'] }
  const r = coincideRadar(LIMPIEZA, crit)
  assert.equal(r.coincide, false)
  assert.equal(r.puntuacion, 0)
})

test('coincideRadar: sin criterios no casa (evita ruido)', () => {
  const r = coincideRadar(LIMPIEZA, {})
  assert.equal(r.coincide, false)
})

import { filtrarRadar, necesitaOcr } from '../src/radar.ts'

test('filtrarRadar: devuelve solo los que casan, ordenados por puntuación', () => {
  const anuncios: AnuncioRadar[] = [
    { titulo: 'Obra de carretera', cpv: ['45200000'] },
    { titulo: 'Limpieza de oficinas', objeto: 'limpieza', cpv: ['90910000'], presupuesto: 30000 },
    { titulo: 'Limpieza y mantenimiento', objeto: 'limpieza integral', cpv: ['90910000'] },
  ]
  const crit: CriteriosRadar = { cpv: ['9091'], palabras_clave: ['limpieza'] }
  const out = filtrarRadar(anuncios, crit)
  assert.equal(out.length, 2)               // la obra se descarta
  assert.ok(/Limpieza/.test(out[0].titulo)) // el de más puntos primero
})

test('necesitaOcr: texto demasiado corto sugiere PDF escaneado', () => {
  assert.equal(necesitaOcr('   '), true)
  assert.equal(necesitaOcr('x'.repeat(50)), true)
  assert.equal(necesitaOcr('x'.repeat(500)), false)
})

test('necesitaOcr: umbral configurable', () => {
  assert.equal(necesitaOcr('x'.repeat(120), 100), false)
  assert.equal(necesitaOcr('x'.repeat(80), 100), true)
})
