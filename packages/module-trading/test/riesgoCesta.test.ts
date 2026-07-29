import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  retornosDiarios, desviacion, maxDrawdown, curvaCestaEquiponderada,
  volatilidadAnual, trackingErrorAnual, metricasRiesgoCesta,
} from '../src/riesgoCesta.ts'
import { seleccionSoloGurus } from '../src/seleccion.ts'

test('retornosDiarios calcula variaciones y salta precios previos ≤ 0', () => {
  const r = retornosDiarios([100, 110, 99])
  assert.equal(r.length, 2)
  assert.ok(Math.abs(r[0] - 0.1) < 1e-9)
  assert.ok(Math.abs(r[1] + 0.1) < 1e-9)
  assert.deepEqual(retornosDiarios([0, 5]), []) // previo 0 → se salta
})

test('desviacion: muestral (n−1), null con <2', () => {
  assert.equal(desviacion([5]), null)
  assert.equal(desviacion([]), null)
  // [1,3] → media 2, var = (1+1)/1 = 2 → sd = √2
  assert.ok(Math.abs(desviacion([1, 3])! - Math.SQRT2) < 1e-9)
})

test('maxDrawdown: peor caída pico→valle, ≤ 0; monótona creciente = 0', () => {
  assert.equal(maxDrawdown([1, 2, 3, 4]), 0)
  // sube a 2, cae a 1 → −50%; luego recupera
  assert.ok(Math.abs(maxDrawdown([1, 2, 1, 3]) + 0.5) < 1e-9)
  assert.equal(maxDrawdown([]), 0)
})

test('curvaCestaEquiponderada: media de series normalizadas, arranca en 1, alinea a la más corta', () => {
  const c = curvaCestaEquiponderada([[100, 110], [200, 180]])
  assert.ok(c && Math.abs(c[0] - 1) < 1e-9)         // (1+1)/2
  assert.ok(c && Math.abs(c[1] - (1.1 + 0.9) / 2) < 1e-9) // (1.1+0.9)/2 = 1.0
  // longitudes distintas → se trunca a la común (2)
  const c2 = curvaCestaEquiponderada([[10, 11, 12], [10, 12]])
  assert.equal(c2!.length, 2)
  // descarta series inválidas
  assert.equal(curvaCestaEquiponderada([[5]]), null)
  assert.equal(curvaCestaEquiponderada([[0, 1]]), null)
})

test('volatilidadAnual: 0 si la curva no se mueve, positiva si oscila, null si insuficiente', () => {
  assert.equal(volatilidadAnual([1, 1, 1, 1]), 0)
  assert.ok((volatilidadAnual([1, 1.1, 1, 1.1]) ?? 0) > 0)
  assert.equal(volatilidadAnual([1]), null)
})

test('trackingErrorAnual: 0 si cesta y bench se mueven idéntico; >0 si divergen; null si corto', () => {
  const cesta = [1, 1.1, 1.21, 1.331]
  assert.ok(Math.abs(trackingErrorAnual(cesta, cesta)!) < 1e-9) // idénticas → TE 0
  const bench = [1, 1.05, 1.0, 1.2]
  assert.ok((trackingErrorAnual(cesta, bench) ?? 0) > 0)
  assert.equal(trackingErrorAnual([1, 1.1], [1, 1.1]), null)  // <3 puntos
})

test('metricasRiesgoCesta: agrega drawdown/vol/TE de cesta y bench; null si falta bench', () => {
  const m = metricasRiesgoCesta([[100, 110, 120], [50, 55, 60]], [10, 10.5, 11])
  assert.ok(m)
  assert.ok(m!.maxDrawdown <= 0 && m!.maxDrawdownBench <= 0)
  assert.equal(typeof m!.volAnual, 'number')
  assert.equal(metricasRiesgoCesta([[100, 110]], []), null) // sin bench
})

test('seleccionSoloGurus: top por convicción, ignora calidad', () => {
  const entradas = [
    { simbolo: 'A', guruScore: 3, comprando: 2, piotroski: 2, roic: 0.01 },
    { simbolo: 'B', guruScore: 9, comprando: 4, piotroski: null, roic: null },
    { simbolo: 'C', guruScore: 5, comprando: 3, piotroski: 8, roic: 0.2 },
  ]
  assert.deepEqual(seleccionSoloGurus(entradas, 2), ['B', 'C']) // por guruScore, sin mirar piotroski/roic
  assert.equal(seleccionSoloGurus(entradas).length, 3)
})
