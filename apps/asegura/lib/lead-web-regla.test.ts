import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fichaAptaParaEnlace, type FichaLeadWeb } from './lead-web-regla.ts'

const nueva: FichaLeadWeb = { fuente: 'web', sinDni: true, sinNacimiento: true, fusionada: false, horasDesdeAlta: 0.01 }

test('ficha recién creada por el formulario, sin DNI ni nacimiento: apta', () => {
  assert.equal(fichaAptaParaEnlace(nueva), true)
})

test('con DNI o nacimiento en la ficha: NO (la página los enseñaría a quien tenga el enlace)', () => {
  assert.equal(fichaAptaParaEnlace({ ...nueva, sinDni: false }), false)
  assert.equal(fichaAptaParaEnlace({ ...nueva, sinNacimiento: false }), false)
})

test('otra fuente, fusionada o antigua: NO', () => {
  assert.equal(fichaAptaParaEnlace({ ...nueva, fuente: 'venta_directa' }), false)
  assert.equal(fichaAptaParaEnlace({ ...nueva, fuente: null }), false)
  assert.equal(fichaAptaParaEnlace({ ...nueva, fusionada: true }), false)
  assert.equal(fichaAptaParaEnlace({ ...nueva, horasDesdeAlta: 5 }), false)
  assert.equal(fichaAptaParaEnlace({ ...nueva, horasDesdeAlta: Number.NaN }), false)
  assert.equal(fichaAptaParaEnlace({ ...nueva, horasDesdeAlta: -3 }), false)
})
