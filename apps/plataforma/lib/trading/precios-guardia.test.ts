import test from 'node:test'
import assert from 'node:assert/strict'
import { filtrarPreciosAnomalos, resumenDescartes, SALTO_PRECIO_DIA_MAX } from './precios-guardia.ts'

test('el caso real del 03/08/2026: CVX a 590,17 con referencia 192,31 se descarta', () => {
  const { limpios, descartados } = filtrarPreciosAnomalos({ CVX: 590.17 }, { CVX: 192.31 })
  assert.equal(limpios.CVX, undefined)
  assert.equal(descartados.length, 1)
  assert.equal(descartados[0].simbolo, 'CVX')
  assert.ok(descartados[0].ratio! > 3)
})

test('un movimiento normal pasa intacto', () => {
  const precios = { CVX: 190.41, MSFT: 487.46, SPY: 769.79 }
  const { limpios, descartados } = filtrarPreciosAnomalos(precios, { CVX: 193.18, MSFT: 492.82, SPY: 771.24 })
  assert.deepEqual(limpios, precios)
  assert.equal(descartados.length, 0)
})

test('sin referencia NO se juzga: el precio pasa (un símbolo nuevo no tiene con qué compararse)', () => {
  const { limpios, descartados } = filtrarPreciosAnomalos({ NUEVO: 12.5 }, {})
  assert.equal(limpios.NUEVO, 12.5)
  assert.equal(descartados.length, 0)
})

test('una referencia inválida (0) tampoco juzga: no convierte un «no lo sé» en descarte', () => {
  const { limpios, descartados } = filtrarPreciosAnomalos({ X: 100 }, { X: 0 })
  assert.equal(limpios.X, 100)
  assert.equal(descartados.length, 0)
})

test('el desplome simétrico también se caza (÷2, no solo ×2)', () => {
  const { limpios, descartados } = filtrarPreciosAnomalos({ X: 45 }, { X: 190 })
  assert.equal(limpios.X, undefined)
  assert.equal(descartados.length, 1)
  assert.ok(descartados[0].ratio! < 0.5)
})

test('precios imposibles se descartan aunque no haya referencia', () => {
  const { limpios, descartados } = filtrarPreciosAnomalos({ A: 0, B: -5, C: Number.NaN }, {})
  assert.deepEqual(limpios, {})
  assert.equal(descartados.length, 3)
  assert.ok(descartados.every(d => d.referencia === null))
})

test('el umbral es el límite exacto: justo por debajo pasa, justo en el umbral no', () => {
  assert.equal(filtrarPreciosAnomalos({ X: 199 }, { X: 100 }).limpios.X, 199)
  assert.equal(filtrarPreciosAnomalos({ X: 200 }, { X: 100 }).limpios.X, undefined)
  assert.equal(SALTO_PRECIO_DIA_MAX, 2)
})

test('descartar un símbolo no arrastra a los demás de la misma pasada', () => {
  const { limpios, descartados } = filtrarPreciosAnomalos(
    { CVX: 590.17, MSFT: 487.46 },
    { CVX: 192.31, MSFT: 492.82 },
  )
  assert.deepEqual(limpios, { MSFT: 487.46 })
  assert.equal(descartados.length, 1)
})

test('resumenDescartes: cadena vacía cuando no hay nada que contar', () => {
  assert.equal(resumenDescartes([]), '')
  assert.match(resumenDescartes(filtrarPreciosAnomalos({ CVX: 590.17 }, { CVX: 192.31 }).descartados), /^1 precio\(s\) descartado\(s\): CVX 590\.17/)
})
