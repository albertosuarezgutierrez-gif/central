import test from 'node:test'
import assert from 'node:assert/strict'
import { valorarCarteraEstudio } from './cartera-estudio.ts'

const POR_SIMBOLO = [
  { simbolo: 'AAA', retorno: 0.10 },
  { simbolo: 'BBB', retorno: -0.05 },
]

test('valorarCarteraEstudio reparte equiponderado, aplica retornos y convierte con el FX', () => {
  // 30.000€ → 33.000$ (fx 1,10); 16.500$ por posición; AAA→18.150$, BBB→15.675$ = 33.825$;
  // de vuelta a EUR con fx 1,05 → 32.214,29€. SPY +2% → 33.660$ → 32.057,14€.
  const c = valorarCarteraEstudio(30_000, '2026-07-20', 'v1', POR_SIMBOLO, 'SPY', 0.02, 1.10, 1.05)!
  assert.equal(c.posiciones.length, 2)
  assert.equal(c.posiciones[0].simbolo, 'AAA')                    // ordenado de mejor a peor
  assert.ok(Math.abs(c.posiciones[0].invertidoEur - 15_000) < 1e-9)
  assert.ok(Math.abs(c.valorEur - 33_825 / 1.05) < 0.01)
  assert.ok(Math.abs(c.plEur - (33_825 / 1.05 - 30_000)) < 0.01)
  assert.ok(Math.abs(c.bench.valorEur - 33_660 / 1.05) < 0.01)
  assert.equal(c.fx.disponible, true)
})

test('sin FX degrada a 1:1 y lo marca como no disponible', () => {
  const c = valorarCarteraEstudio(30_000, '2026-07-20', 'v1', POR_SIMBOLO, 'SPY', 0.02, null, null)!
  assert.equal(c.fx.disponible, false)
  // Equiponderado sin FX: media de retornos +2,5% → 30.750
  assert.ok(Math.abs(c.valorEur - 30_750) < 1e-6)
})

test('entradas inválidas → null', () => {
  assert.equal(valorarCarteraEstudio(30_000, 'f', 'v', [], 'SPY', 0, 1.1, 1.05), null)
  assert.equal(valorarCarteraEstudio(0, 'f', 'v', POR_SIMBOLO, 'SPY', 0, 1.1, 1.05), null)
})
