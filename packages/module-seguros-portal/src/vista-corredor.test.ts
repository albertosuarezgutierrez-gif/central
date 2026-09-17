import test from 'node:test'
import assert from 'node:assert/strict'
import {
  IDENTIDAD_CORREDOR_ID,
  enlaceVistaCorredor,
  estadoEnlaceVista,
  formatoTokenVistaValido,
  generarTokenVista,
  hashTokenVista,
} from './vista-corredor.ts'

const T0 = new Date('2026-09-08T10:00:00Z')
const min = (n: number) => new Date(T0.getTime() + n * 60_000)

test('la identidad del corredor es un UUID v4 fijo', () => {
  assert.match(IDENTIDAD_CORREDOR_ID, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
})

test('el token son 64 hex y cada uno es distinto', () => {
  const a = generarTokenVista()
  const b = generarTokenVista()
  assert.ok(formatoTokenVistaValido(a))
  assert.notEqual(a, b)
  assert.equal(formatoTokenVistaValido(a.toUpperCase()), false)
  assert.equal(formatoTokenVistaValido(a.slice(1)), false)
  assert.equal(formatoTokenVistaValido(null), false)
})

test('el hash es SHA-256 hex, estable y sin pimienta', async () => {
  // SHA-256("abc"), vector conocido: la otra app tiene que poder calcular EXACTAMENTE esto.
  assert.equal(await hashTokenVista('abc'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
})

test('el enlace se usa una vez y dentro de plazo; «usado» gana a «caducado»', () => {
  assert.equal(estadoEnlaceVista({ creadoEn: T0, usadoEn: null }, min(9)), 'valido')
  assert.equal(estadoEnlaceVista({ creadoEn: T0, usadoEn: null }, min(10)), 'valido')
  assert.equal(estadoEnlaceVista({ creadoEn: T0, usadoEn: null }, min(11)), 'caducado')
  assert.equal(estadoEnlaceVista({ creadoEn: T0, usadoEn: min(1) }, min(2)), 'usado')
  assert.equal(estadoEnlaceVista({ creadoEn: T0, usadoEn: min(1) }, min(60)), 'usado')
})

test('el enlace va al portal sin query ni fragmento, y sin base no hay enlace', () => {
  const t = 'a'.repeat(64)
  assert.equal(enlaceVistaCorredor('https://clientes.grupoasegura.es/?x=1#y', t), `https://clientes.grupoasegura.es/corredor/${t}`)
  assert.equal(enlaceVistaCorredor(null, t), null)
})
