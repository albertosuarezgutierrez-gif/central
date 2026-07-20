import test from 'node:test'
import assert from 'node:assert/strict'
import { anomaliasUniverso, camposEnvenenados } from './calidad-datos.ts'

test('anomaliasUniverso caza el caso MCD (mkt_cap de 196.044$) y el EY inflado', () => {
  const a = anomaliasUniverso([
    { simbolo: 'MCD', mktCap: 196_044, earningsYield: 45_000 },
    { simbolo: 'MSFT', mktCap: 2.9e12, earningsYield: 0.04 },
  ])
  assert.deepEqual(a.map(x => `${x.simbolo}:${x.campo}`), ['MCD:mktCap', 'MCD:earningsYield'])
})

test('los extremos REALES de la manía de memoria NO saltan (SNDK +4715% es real)', () => {
  const a = anomaliasUniverso([
    { simbolo: 'SNDK', momentum: 47.15, mktCap: 1.96e11 },
    { simbolo: 'MU', momentum: 7.77, mktCap: 9.28e11, roic: -0.095 },
  ])
  assert.deepEqual(a, [])
})

test('momentum imposible, precio 0 y NaN sí saltan; null/undefined se ignoran', () => {
  const a = anomaliasUniverso([
    { simbolo: 'XXX', momentum: 150, precio: 0 },
    { simbolo: 'YYY', roic: NaN, mktCap: null, earningsYield: undefined },
  ])
  assert.deepEqual(a.map(x => `${x.simbolo}:${x.campo}`), ['XXX:precio', 'XXX:momentum', 'YYY:roic'])
})

test('camposEnvenenados agrupa por símbolo', () => {
  const m = camposEnvenenados([
    { simbolo: 'MCD', campo: 'mktCap', valor: 1, motivo: '' },
    { simbolo: 'MCD', campo: 'earningsYield', valor: 1, motivo: '' },
  ])
  assert.deepEqual([...m.get('MCD')!], ['mktCap', 'earningsYield'])
})
