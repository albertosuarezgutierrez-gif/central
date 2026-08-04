import { test } from 'node:test'
import assert from 'node:assert/strict'
import { superaConcentracion, esPromediarPerdedor, superaLimiteOps, earningsInminente, bajoTendencia, factorFlojo } from '../src/riesgo.ts'
import type { PaperPosicion } from '../src/types.ts'

const pos: PaperPosicion = { simbolo: 'NVDA', cantidad: 10, precioEntrada: 100, stop: 90, abiertaEn: '2026-07-01' }

test('superaConcentracion true si la nueva posición pasa del 20% del NAV', () => {
  assert.equal(superaConcentracion(2500, 10_000, 0.2), true)   // 25% > 20%
  assert.equal(superaConcentracion(1500, 10_000, 0.2), false)  // 15% < 20%
})

test('esPromediarPerdedor true si añades a una posición en pérdida', () => {
  assert.equal(esPromediarPerdedor(pos, 90), true)   // precio 90 < entrada 100
  assert.equal(esPromediarPerdedor(pos, 110), false)
})

test('superaLimiteOps true al pasar el máximo de ops por nombre', () => {
  assert.equal(superaLimiteOps(5, 5), true)
  assert.equal(superaLimiteOps(3, 5), false)
})

test('earningsInminente veta abrir si los resultados caen dentro de la ventana', () => {
  assert.equal(earningsInminente('2026-07-20', '2026-07-18', 3), true)   // en 2 días
  assert.equal(earningsInminente('2026-07-25', '2026-07-18', 3), false)  // en 7 días
  assert.equal(earningsInminente('2026-07-15', '2026-07-18', 3), false)  // ya pasaron
  assert.equal(earningsInminente(undefined, '2026-07-18', 3), false)     // sin fecha, no veta
})

test('bajoTendencia veta el largo por debajo de la SMA50; degrada sin dato', () => {
  assert.equal(bajoTendencia(95, 100), true)    // precio bajo SMA50 → cuchillo, no comprar
  assert.equal(bajoTendencia(105, 100), false)  // precio sobre SMA50 → tendencia de fondo ok
  assert.equal(bajoTendencia(100, 100), true)   // en la media, no arriesgar
  assert.equal(bajoTendencia(95, null), false)  // sin SMA50 (serie corta), no veta
  assert.equal(bajoTendencia(95, undefined), false)
})

test('factorFlojo veta el largo cuando el score de factores está bajo el mínimo; degrada sin datos', () => {
  assert.equal(factorFlojo(-0.5, 0), true)      // score por debajo de la media del universo → no comprar
  assert.equal(factorFlojo(0.8, 0), false)      // buen score → pasa
  assert.equal(factorFlojo(0, 0), false)        // justo en el umbral, no veta (< estricto)
  assert.equal(factorFlojo(undefined, 0), false)// sin score → degrada (comportamiento anterior)
  assert.equal(factorFlojo(-2, null), false)    // sin umbral → no veta
})
