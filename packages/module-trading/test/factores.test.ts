import { test } from 'node:test'
import assert from 'node:assert/strict'
import { zscores, rankearFactores, momentum12_1, type MetricasFactor } from '../src/factores.ts'

test('zscores normaliza y trata los ausentes como 0 (neutral)', () => {
  const z = zscores([10, 20, 30, undefined])
  assert.equal(z[3], 0)                       // ausente → neutral
  assert.ok(z[0] < 0 && z[2] > 0)             // 10 por debajo de la media, 30 por encima
  assert.ok(Math.abs(z[0] + z[2]) < 1e-9)     // simétricos alrededor de la media 20
})

test('zscores devuelve todo 0 sin dispersión o con <2 valores', () => {
  assert.deepEqual(zscores([5, 5, 5]), [0, 0, 0])
  assert.deepEqual(zscores([7, undefined]), [0, 0])
})

test('rankearFactores pone primero al barato+sano+con momentum', () => {
  const u: MetricasFactor[] = [
    { simbolo: 'GANADORA', earningsYield: 0.15, fcfYield: 0.10, shareholderYield: 0.06, roic: 0.30, margenNeto: 0.25, piotroski: 8, deudaEbitda: 0.5, momentum12m: 0.30 },
    { simbolo: 'MEDIA',    earningsYield: 0.08, fcfYield: 0.05, shareholderYield: 0.02, roic: 0.15, margenNeto: 0.12, piotroski: 5, deudaEbitda: 2.0, momentum12m: 0.05 },
    { simbolo: 'PERDEDORA',earningsYield: 0.03, fcfYield: 0.01, shareholderYield: -0.02, roic: 0.05, margenNeto: 0.04, piotroski: 2, deudaEbitda: 4.5, momentum12m: -0.20 },
  ]
  const r = rankearFactores(u)
  assert.equal(r[0].simbolo, 'GANADORA')
  assert.equal(r[2].simbolo, 'PERDEDORA')
  assert.ok(r[0].score > r[1].score && r[1].score > r[2].score)
})

test('rankearFactores invierte la deuda: menos deudaEbitda mejora la calidad', () => {
  const u: MetricasFactor[] = [
    { simbolo: 'POCA_DEUDA', deudaEbitda: 0.5 },
    { simbolo: 'MUCHA_DEUDA', deudaEbitda: 5.0 },
  ]
  const r = rankearFactores(u, { calidad: 1, valor: 0, momentum: 0 })
  assert.equal(r[0].simbolo, 'POCA_DEUDA')
  assert.ok(r[0].zCalidad > r[1].zCalidad)
})

test('rankearFactores respeta los pesos: solo-momentum ordena por momentum', () => {
  const u: MetricasFactor[] = [
    { simbolo: 'CARA_CON_INERCIA', earningsYield: 0.02, momentum12m: 0.50 },
    { simbolo: 'BARATA_SIN_INERCIA', earningsYield: 0.20, momentum12m: -0.10 },
  ]
  const soloMom = rankearFactores(u, { valor: 0, calidad: 0, momentum: 1 })
  assert.equal(soloMom[0].simbolo, 'CARA_CON_INERCIA')
  const soloValor = rankearFactores(u, { valor: 1, calidad: 0, momentum: 0 })
  assert.equal(soloValor[0].simbolo, 'BARATA_SIN_INERCIA')
})

test('rankearFactores no rompe con universo vacío', () => {
  assert.deepEqual(rankearFactores([]), [])
})

test('momentum12_1 calcula el retorno 12−1 meses y degrada/anula según histórico', () => {
  // Serie creciente de 300 velas: momentum positivo (hace 12m < hace 1m).
  const sube = Array.from({ length: 300 }, (_, i) => 100 + i)
  const m = momentum12_1(sube)
  assert.ok(m !== null && m > 0)
  // Histórico demasiado corto → null.
  assert.equal(momentum12_1([100, 101, 102]), null)
})
