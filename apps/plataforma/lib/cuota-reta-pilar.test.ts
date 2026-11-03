import test from 'node:test'
import assert from 'node:assert/strict'
import { cuotaRetaPilar, ETIQUETA_CUOTA_PERFIL } from './cuota-reta-pilar.ts'

test('perfil presente: manda el valor anual del perfil, no el banco', () => {
  const r = cuotaRetaPilar(661.49, 467.45, 1)
  assert.equal(r.importe, 661.49)
  assert.equal(r.fuente, 'perfil')
  assert.equal(r.etiqueta, ETIQUETA_CUOTA_PERFIL)
})
test('trimestre = perfil/4', () => {
  assert.equal(cuotaRetaPilar(661.49, 100, 0.25).importe, 165.37)
})
test('perfil null: cae al banco', () => {
  const r = cuotaRetaPilar(null, 467.45, 1)
  assert.equal(r.importe, 467.45)
  assert.equal(r.fuente, 'banco')
})
test('perfil 0 es un valor (no cae al banco)', () => {
  assert.equal(cuotaRetaPilar(0, 467.45, 1).importe, 0)
})
test('rango libre: no se prorratea, banco', () => {
  assert.equal(cuotaRetaPilar(661.49, 50, null).fuente, 'banco')
})
