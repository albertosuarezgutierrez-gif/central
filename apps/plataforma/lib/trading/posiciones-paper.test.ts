import test from 'node:test'
import assert from 'node:assert/strict'
import { resumenPaper, resultadoPosicion } from './posiciones-paper.ts'

// Posiciones reales de trading_paper_posicion (28/08/2026), recortadas a tres.
const NVDA = { simbolo: 'NVDA', cantidad: 27, precioEntrada: 214.72 }
const ORCL = { simbolo: 'ORCL', cantidad: 21, precioEntrada: 156.26 }
const MSFT = { simbolo: 'MSFT', cantidad: 9, precioEntrada: 492.82 }

test('resultado de una posición: valor y P&L en dólares sobre el coste', () => {
  const r = resultadoPosicion(NVDA, 220)
  assert.ok(Math.abs((r.coste ?? 0) - 5797.44) < 1e-6)
  assert.equal(r.valor, 5940)
  assert.ok(Math.abs((r.pnl ?? 0) - 142.56) < 1e-6)
  assert.ok(Math.abs((r.rentabilidad ?? 0) - 142.56 / 5797.44) < 1e-12)
})

test('sin precio de hoy NO hay valor ni P&L (nunca 0, nunca el precio de entrada)', () => {
  const r = resultadoPosicion(NVDA, null)
  assert.ok(Math.abs((r.coste ?? 0) - 5797.44) < 1e-6)
  assert.equal(r.valor, null)
  assert.equal(r.pnl, null)
  assert.equal(r.rentabilidad, null)
})

test('un precio no finito se trata como «no lo sé», no como 0', () => {
  assert.equal(resultadoPosicion(NVDA, Number.NaN).valor, null)
  assert.equal(resultadoPosicion(NVDA, Number.POSITIVE_INFINITY).pnl, null)
})

test('resumen completo: invertido, valor y dinero ganado', () => {
  const precios = new Map([['NVDA', 220], ['ORCL', 160], ['MSFT', 500]])
  const r = resumenPaper([NVDA, ORCL, MSFT], s => precios.get(s) ?? null)
  const coste = 27 * 214.72 + 21 * 156.26 + 9 * 492.82
  const valor = 27 * 220 + 21 * 160 + 9 * 500
  assert.equal(r.n, 3)
  assert.equal(r.nValoradas, 3)
  assert.equal(r.completo, true)
  assert.deepEqual(r.sinPrecio, [])
  assert.ok(Math.abs(r.invertidoTotal - coste) < 1e-6)
  assert.ok(Math.abs(r.invertidoValorado - coste) < 1e-6)
  assert.ok(Math.abs((r.valor ?? 0) - valor) < 1e-6)
  assert.ok(Math.abs((r.pnl ?? 0) - (valor - coste)) < 1e-6)
  assert.ok(Math.abs((r.rentabilidad ?? 0) - (valor - coste) / coste) < 1e-12)
})

test('parcial: el P&L se mide contra el coste de las MISMAS posiciones valoradas', () => {
  const precios = new Map([['NVDA', 214.72]]) // ORCL y MSFT sin precio hoy
  const r = resumenPaper([NVDA, ORCL, MSFT], s => precios.get(s) ?? null)
  assert.equal(r.nValoradas, 1)
  assert.equal(r.completo, false)
  assert.deepEqual(r.sinPrecio, ['ORCL', 'MSFT'])
  // El invertido TOTAL sigue siendo el de las tres (el coste se conoce siempre)...
  assert.ok(Math.abs(r.invertidoTotal - (27 * 214.72 + 21 * 156.26 + 9 * 492.82)) < 1e-6)
  // ...pero el P&L compara solo NVDA contra NVDA: plano, no una pérdida inventada de dos tercios.
  assert.ok(Math.abs(r.invertidoValorado - 27 * 214.72) < 1e-6)
  assert.ok(Math.abs(r.pnl ?? 1) < 1e-9)
  assert.ok(Math.abs(r.rentabilidad ?? 1) < 1e-12)
})

test('ninguna posición con precio: valor y P&L son null (no 0) y el invertido sigue sabiéndose', () => {
  const r = resumenPaper([NVDA, ORCL], () => null)
  assert.equal(r.valor, null)
  assert.equal(r.pnl, null)
  assert.equal(r.rentabilidad, null)
  assert.equal(r.completo, false)
  assert.ok(r.invertidoTotal > 0)
})

test('cartera vacía: todo a cero/null sin dividir por cero', () => {
  const r = resumenPaper([], () => 100)
  assert.equal(r.n, 0)
  assert.equal(r.invertidoTotal, 0)
  assert.equal(r.valor, null)
  assert.equal(r.pnl, null)
  assert.equal(r.completo, false)
})
