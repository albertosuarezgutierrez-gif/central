import assert from 'node:assert/strict'
import { test } from 'node:test'

import { baseDeUnidad, evolucionDePrima, porcentajeDeSubida, type FilaPrimaObservada } from './evolucion-prima.ts'

const EN = new Date('2026-10-13T08:00:00Z')
const fila = (p: Partial<FilaPrimaObservada> = {}): FilaPrimaObservada => ({
  importe: 330,
  unidad: 'cartera-bruta-anual|anual',
  observadoEn: EN,
  subidaDesde: 300,
  subidaHasta: 330,
  subidaPorcentaje: 10,
  subidaEn: EN,
  ...p,
})

test('sin fila no hay nada que pintar', () => {
  assert.equal(evolucionDePrima(null), null)
})

test('fila sin subida pendiente (semilla o bajada posterior) no pinta nada', () => {
  assert.equal(evolucionDePrima(fila({ subidaDesde: null, subidaHasta: null, subidaPorcentaje: null, subidaEn: null })), null)
})

test('subida: anterior, actual, % y fecha', () => {
  assert.deepEqual(evolucionDePrima(fila()), { tipo: 'subida', anterior: 300, actual: 330, porcentaje: 10, en: EN, base: 'cartera' })
})

test('el % se recalcula y redondea a 2 decimales (no se fía del guardado)', () => {
  const e = evolucionDePrima(fila({ subidaDesde: 299.99, subidaHasta: 331.5, subidaPorcentaje: 99 }))
  assert.equal(e?.porcentaje, 10.5)
  assert.equal(porcentajeDeSubida(3, 4), 33.33)
  assert.equal(porcentajeDeSubida(100, 112.345), 12.35)
})

test('importes ilegibles son null, jamás 0', () => {
  const e = evolucionDePrima(fila({ subidaDesde: null, subidaHasta: 0, subidaPorcentaje: 12.3456 }))
  assert.equal(e?.anterior, null)
  assert.equal(e?.actual, null)
  assert.equal(e?.porcentaje, 12.35, 'sin importes válidos cae al % guardado, redondeado')
  const sin = evolucionDePrima(fila({ subidaDesde: 0, subidaHasta: null, subidaPorcentaje: null }))
  assert.equal(sin?.porcentaje, null)
  assert.equal(porcentajeDeSubida(0, 10), null)
  assert.equal(porcentajeDeSubida(null, 10), null)
})

test('la fecha ausente no se inventa', () => {
  assert.equal(evolucionDePrima(fila({ subidaEn: null }))?.en, null)
})

test('base por unidad', () => {
  assert.equal(baseDeUnidad('cartera-bruta-anual|mensual'), 'cartera')
  assert.equal(baseDeUnidad('declarada-anual|-'), 'aportada')
  assert.equal(baseDeUnidad('x'), 'otra')
})
