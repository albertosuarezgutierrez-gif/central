import test from 'node:test'
import assert from 'node:assert/strict'
import { anomaliasUniverso, camposEnvenenados, neutralizarUniverso, resumenErrores } from './calidad-datos.ts'

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

test('neutralizarUniverso caza el caso RDY (ADR en rupias: EY 682%) sin tocar las filas sanas', () => {
  // Números REALES de trading_universo el 11/08/2026: RDY salía nº 1 del explorador con score 6,03.
  const { filas, anomalias } = neutralizarUniverso([
    { simbolo: 'RDY', roic: 0.196, earningsYield: 6.8198, fcfYield: 5.0075, momentum: -0.044, mktCap: 9.49e9 },
    { simbolo: 'SNDK', roic: -0.119, earningsYield: -0.0078, fcfYield: -0.0007, momentum: 43.139, mktCap: 1.75e11 },
  ])
  assert.deepEqual(anomalias.map(a => `${a.simbolo}:${a.campo}`), ['RDY:earningsYield', 'RDY:fcfYield'])
  assert.equal(filas[0].earningsYield, null)
  assert.equal(filas[0].fcfYield, null)
  assert.equal(filas[0].momentum, -0.044)     // el campo sano de la fila envenenada se conserva
  assert.equal(filas[1].momentum, 43.139)     // la manía de memoria es real y no se toca
})

test('neutralizarUniverso sin anomalías devuelve las filas tal cual', () => {
  const entrada = [{ simbolo: 'MSFT', earningsYield: 0.04, mktCap: 2.9e12 }]
  const { filas, anomalias } = neutralizarUniverso(entrada)
  assert.equal(anomalias.length, 0)
  assert.equal(filas, entrada)
})

test('resumenErrores desglosa por motivo y marca los estructurales (la foto real del 24/08/2026)', () => {
  const errores = [
    ...Array(109).fill('sin companyfacts'),
    ...Array(30).fill('datos incompletos'),
    ...Array(889).fill(null),
  ]
  assert.equal(resumenErrores(errores), '109 sin companyfacts — estructural · 30 datos incompletos')
})

test('resumenErrores sin errores → null (la línea de salud no añade paréntesis vacío)', () => {
  assert.equal(resumenErrores([null, undefined, null]), null)
  assert.equal(resumenErrores([]), null)
})
