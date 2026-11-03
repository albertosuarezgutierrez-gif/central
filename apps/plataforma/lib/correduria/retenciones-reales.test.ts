// Importes SINTÉTICOS.
import test from 'node:test'
import assert from 'node:assert/strict'
import { retencionesCorreduria, rotuloRetenciones } from './retenciones-reales.ts'

test('sin liquidaciones: todo es estimación al 15 % (cobrado × 15/85)', () => {
  const r = retencionesCorreduria(850, [])
  assert.deepEqual(r, { total: 150, real: 0, estimada: 150, cobradoCubierto: 0, fuente: 'estimada' })
})

test('lectura del libro fallida: estimación, y la parte real es «no se sabe» (null), no 0', () => {
  const r = retencionesCorreduria(850, null)
  assert.equal(r.real, null)
  assert.equal(r.fuente, 'estimada')
  assert.equal(r.total, 150)
})

test('todo el cobrado casa con liquidaciones: retención REAL, sin estimar', () => {
  const r = retencionesCorreduria(170, [{ retencion: 31.2, bancoTotal: 170, bancoEnRango: 170 }])
  assert.deepEqual(r, { total: 31.2, real: 31.2, estimada: 0, cobradoCubierto: 170, fuente: 'real' })
})

test('mixto: lo cubierto con su retención real y el resto estimado', () => {
  const r = retencionesCorreduria(255, [{ retencion: 20, bancoTotal: 170, bancoEnRango: 170 }])
  assert.equal(r.fuente, 'mixta')
  assert.equal(r.real, 20)
  assert.equal(r.estimada, 15) // 85 × 15/85
  assert.equal(r.total, 35)
})

test('abono partido entre rangos: la retención se prorratea', () => {
  const r = retencionesCorreduria(50, [{ retencion: 30, bancoTotal: 100, bancoEnRango: 50 }])
  assert.equal(r.real, 15)
  assert.equal(r.fuente, 'real')
})

test('rótulo: la parte estimada siempre se dice como estimación', () => {
  assert.equal(rotuloRetenciones(retencionesCorreduria(850, []), 150), '150,00€ (estimada 15 %, sin liquidaciones)')
  assert.equal(rotuloRetenciones(retencionesCorreduria(850, null), 150), '150,00€ (estimada 15 %: no se pudo leer el libro de comisiones)')
  assert.equal(rotuloRetenciones(undefined, 150), '150,00€ (estimada 15 %, sin liquidaciones)')
  assert.equal(rotuloRetenciones(retencionesCorreduria(170, [{ retencion: 31.2, bancoTotal: 170, bancoEnRango: 170 }]), 31.2), '31,20€ (real, de las liquidaciones)')
  assert.equal(rotuloRetenciones(retencionesCorreduria(255, [{ retencion: 20, bancoTotal: 170, bancoEnRango: 170 }]), 35), '35,00€ = 20,00€ real (liquidaciones) + 15,00€ estimada 15 %')
})
