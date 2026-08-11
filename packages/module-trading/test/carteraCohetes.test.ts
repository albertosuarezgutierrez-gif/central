import { test } from 'node:test'
import assert from 'node:assert/strict'
import { rebalancear, valorar } from '../src/carteraCohetes.ts'

test('rebalancear reparte el capital a partes iguales por precio', () => {
  const reb = rebalancear(30000, [
    { simbolo: 'AAA', precio: 100, esIpo: false, mesesCotizando: null },
    { simbolo: 'BBB', precio: 50, esIpo: true, mesesCotizando: 3 },
  ])
  assert.equal(reb.capitalEur, 30000)
  assert.equal(reb.tenencias.length, 2)
  // 15.000€ por nombre → 150 uds de AAA, 300 uds de BBB
  assert.equal(reb.tenencias[0].unidades, 150)
  assert.equal(reb.tenencias[1].unidades, 300)
  assert.equal(reb.tenencias[1].esIpo, true)
})

test('rebalancear ignora picks sin precio válido', () => {
  const reb = rebalancear(10000, [
    { simbolo: 'AAA', precio: 100, esIpo: false, mesesCotizando: null },
    { simbolo: 'ZZZ', precio: 0, esIpo: false, mesesCotizando: null },
  ])
  assert.equal(reb.tenencias.length, 1)          // ZZZ fuera
  assert.equal(reb.tenencias[0].unidades, 100)   // 10.000€ enteros a AAA
})

test('valorar calcula valor, P&L y sub-cesta IPO; precio ausente mantiene entrada', () => {
  const reb = rebalancear(20000, [
    { simbolo: 'AAA', precio: 100, esIpo: false, mesesCotizando: null }, // 100 uds
    { simbolo: 'BBB', precio: 100, esIpo: true, mesesCotizando: 2 },     // 100 uds
  ])
  const v = valorar(reb, { AAA: 150, BBB: 50 })  // AAA +50%, BBB -50%
  assert.equal(v.valorEur, 100 * 150 + 100 * 50) // 20.000€ (se compensan)
  assert.equal(v.plPct, 0)
  assert.equal(v.nIpo, 1)
  assert.equal(v.ipoValorEur, 5000)              // BBB: 100 uds × 50
  assert.equal(v.ipoPlPct, -0.5)                 // desde 10.000€ de entrada
  // precio ausente → mantiene precioEntrada (no rompe la curva)
  const v2 = valorar(reb, { AAA: 150 })
  assert.equal(v2.porNombre[1].precioHoy, 100)
})
