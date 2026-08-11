import { test } from 'node:test'
import assert from 'node:assert/strict'
import { seleccionCombinada, type EntradaCombinada } from '../src/seleccion.ts'

const E = (simbolo: string, guruScore: number, piotroski: number | null, roic: number | null): EntradaCombinada =>
  ({ simbolo, guruScore, comprando: 1, piotroski, roic })

test('seleccionCombinada deja pasar solo la CALIDAD (piotroski + roic) y rankea por convicción', () => {
  const r = seleccionCombinada([
    E('AAA', 5, 8, 0.30),   // apto, mayor convicción
    E('BBB', 3, 7, 0.15),   // apto
    E('CCC', 9, 4, 0.50),   // piotroski flojo → descartado pese a convicción alta
    E('DDD', 8, 8, 0.02),   // roic flojo → descartado
    E('EEE', 2, null, 0.4), // sin datos → descartado
  ], { minPiotroski: 6, minRoic: 0.10 })

  assert.deepEqual(r.cesta.map(x => x.simbolo), ['AAA', 'BBB'])   // solo los aptos, por convicción
  assert.equal(r.cesta.every(x => x.apto), true)
  const desc = Object.fromEntries(r.descartados.map(x => [x.simbolo, x.motivo]))
  assert.match(desc.CCC, /piotroski 4/)
  assert.match(desc.DDD, /roic/)
  assert.equal(desc.EEE, 'sin datos fundamentales')
})

test('seleccionCombinada equipondera y limita a tam (cap de concentración)', () => {
  const entradas = Array.from({ length: 10 }, (_, i) => E(`S${i}`, 10 - i, 7, 0.2))  // todos aptos
  const r = seleccionCombinada(entradas, { tam: 4 })
  assert.equal(r.cesta.length, 4)
  assert.deepEqual(r.cesta.map(x => x.simbolo), ['S0', 'S1', 'S2', 'S3'])  // top convicción
  assert.ok(Math.abs(r.pesoPct - 0.25) < 1e-9)                             // 1/4
})

test('seleccionCombinada sin aptos → cesta vacía, pesoPct 0, todos descartados', () => {
  const r = seleccionCombinada([E('X', 5, 3, 0.05), E('Y', 4, null, null)])
  assert.equal(r.cesta.length, 0)
  assert.equal(r.pesoPct, 0)
  assert.equal(r.descartados.length, 2)
})

test('seleccionCombinada respeta los umbrales por defecto (piotroski 6, roic 10%)', () => {
  const r = seleccionCombinada([E('Z', 5, 6, 0.10)])   // justo en el límite → apto
  assert.equal(r.cesta.length, 1)
  assert.deepEqual(r.params, { minPiotroski: 6, minRoic: 0.10, tam: 25 })
})
