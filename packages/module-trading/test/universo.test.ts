import { test } from 'node:test'
import assert from 'node:assert/strict'
import { rankearUniverso, etiquetaCalidad, diffRanking, snapshotsParaEvaluar, resumenTrackRecord } from '../src/universo.ts'

const emp = (simbolo: string, extra: Record<string, unknown> = {}) => ({
  simbolo, nombre: `${simbolo} Corp`, piotroski: 6, roic: 0.12, earningsYield: 0.06, momentum: 0.1, mktCap: 1e10, guruScore: 0, ...extra,
})

test('rankearUniverso: excluye sin piotroski/roic, ordena mejor primero, respeta top', () => {
  const r = rankearUniverso([
    emp('AAA', { piotroski: 9, roic: 0.3, earningsYield: 0.12, momentum: 0.4 }),
    emp('BBB'),
    emp('CCC', { piotroski: null }),          // sin quality core → excluida
    emp('DDD', { piotroski: 2, roic: 0.01, earningsYield: 0.01, momentum: -0.2 }),
  ], { top: 2 })
  assert.equal(r.universoTotal, 4)
  assert.equal(r.conDatos, 3)                  // CCC fuera
  assert.equal(r.sinValor, 0)
  assert.equal(r.items.length, 2)
  assert.equal(r.items[0].simbolo, 'AAA')      // la mejor en todo
  assert.equal(r.items[0].nombre, 'AAA Corp')  // el nombre viaja con el item
  assert.ok(r.items[0].score > r.items[1].score)
})

test('rankearUniverso: sin NINGÚN dato de valor NO se rankea (zValor 0 = la media, no una abstención)', () => {
  const r = rankearUniverso([
    emp('AAA', { earningsYield: 0.02, fcfYield: 0.01 }),
    emp('BBB', { earningsYield: 0.03, fcfYield: 0.02 }),
    // Caso real (TSEM/NBIS/ASX el 08/08/2026): calidad conocida y momentum enorme, valor DESCONOCIDO.
    // Antes entraba con zValor = 0 y se colaba en el top-20 por delante del 58% del universo.
    emp('SINVAL', { earningsYield: null, fcfYield: null, piotroski: 9, roic: 0.5, momentum: 3 }),
  ], { top: 10 })
  assert.equal(r.conDatos, 2)
  assert.equal(r.sinValor, 1)
  assert.equal(r.items.find(i => i.simbolo === 'SINVAL'), undefined)
})

test('rankearUniverso: basta UNO de los dos datos de valor (EY o FCFY) para entrar', () => {
  const soloEy = rankearUniverso([emp('A', { fcfYield: null }), emp('B', { fcfYield: null })], { top: 5 })
  assert.equal(soloEy.conDatos, 2)
  const soloFcf = rankearUniverso([
    emp('A', { earningsYield: null, fcfYield: 0.04 }),
    emp('B', { earningsYield: null, fcfYield: 0.05 }),
  ], { top: 5 })
  assert.equal(soloFcf.conDatos, 2)
  assert.equal(soloFcf.sinValor, 0)
})

test('etiquetaCalidad: débil sin datos completos; fuerte = calidad alta + confirmación; media el resto', () => {
  assert.equal(etiquetaCalidad(emp('X', { earningsYield: null })), 'debil')       // incompleto
  assert.equal(etiquetaCalidad(emp('X', { datosFrescos: false })), 'debil')       // rancio
  assert.equal(etiquetaCalidad(emp('X', { piotroski: 8, roic: 0.2, guruScore: 3 })), 'fuerte')
  assert.equal(etiquetaCalidad(emp('X', { piotroski: 8, roic: 0.2, momentum: 0.15 })), 'fuerte')  // confirma momentum
  assert.equal(etiquetaCalidad(emp('X', { piotroski: 8, roic: 0.2, momentum: -0.1 })), 'media')   // calidad sin confirmación
  assert.equal(etiquetaCalidad(emp('X')), 'media')
})

test('diffRanking: entradas y salidas del top', () => {
  const d = diffRanking(['A', 'B', 'C'], ['B', 'C', 'D'])
  assert.deepEqual(d.entran, ['D'])
  assert.deepEqual(d.salen, ['A'])
  assert.deepEqual(diffRanking([], ['A']).entran, ['A'])   // primer snapshot: todo "entra"
})

test('snapshotsParaEvaluar: el más cercano a cada objetivo dentro de tolerancia, sin repetir', () => {
  const hoy = '2026-07-19'
  const fechas = ['2026-07-13', '2026-06-22', '2026-05-25', '2026-04-20']
  // objetivos por defecto ~28/56/91 días atrás → 21/06 (27d), 25/05 (55d), 20/04 (90d)
  assert.deepEqual(snapshotsParaEvaluar(fechas, hoy), ['2026-06-22', '2026-05-25', '2026-04-20'])
  // sin snapshots dentro de tolerancia → vacío
  assert.deepEqual(snapshotsParaEvaluar(['2026-07-18'], hoy), [])
})

test('resumenTrackRecord: cuenta ventanas que baten al SPY por MEDIANA', () => {
  const r = resumenTrackRecord([
    { fecha: '2026-06-22', dias: 27, mediana: 0.05, retornoBench: 0.02, baten: 6, n: 10 },
    { fecha: '2026-05-25', dias: 55, mediana: 0.01, retornoBench: 0.04, baten: 3, n: 10 },
  ])
  assert.equal(r.ventanas, 2)
  assert.equal(r.bateVentanas, 1)
})
