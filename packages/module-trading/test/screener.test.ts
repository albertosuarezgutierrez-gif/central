import { test } from 'node:test'
import assert from 'node:assert/strict'
import { infravalorada, pasaScreener, puntuarCandidato, rankearCantera } from '../src/screener.ts'
import type { Candidato } from '../src/types.ts'

test('infravalorada por descuento vs valor razonable (DCF)', () => {
  assert.equal(infravalorada({ valorRazonable: 100 }, 80, 0.15), true)   // 20% barato
  assert.equal(infravalorada({ valorRazonable: 100 }, 90, 0.15), false)  // solo 10%
})

test('infravalorada por múltiplos (PER<15 y PB<3)', () => {
  assert.equal(infravalorada({ per: 10, pb: 2 }, 50), true)
  assert.equal(infravalorada({ per: 10, pb: 5 }, 50), false)   // PB alto
  assert.equal(infravalorada({ per: 30, pb: 2 }, 50), false)   // PER alto
})

test('pasaScreener exige TODOS los criterios presentes', () => {
  const c: Candidato = { simbolo: 'X', precio: 80, rvol: 2.5, fundamentales: { per: 12, pb: 2, valorRazonable: 100 } }
  assert.equal(pasaScreener(c, { rvolMin: 2, perMax: 15 }).pasa, true)
  const r = pasaScreener(c, { rvolMin: 3 })   // pide rvol 3, tiene 2.5
  assert.equal(r.pasa, false)
  assert.ok(r.motivos[0].includes('rvol'))
})

test('rankearCantera filtra y ordena por score (volumen inusual + descuento)', () => {
  const cands: Candidato[] = [
    { simbolo: 'A', precio: 90, rvol: 2.1, fundamentales: { valorRazonable: 100 } },   // poco descuento
    { simbolo: 'B', precio: 60, rvol: 3.0, fundamentales: { valorRazonable: 100 } },   // pico + 40% barato
    { simbolo: 'C', precio: 50, rvol: 1.0 },                                            // no pasa rvolMin
  ]
  const out = rankearCantera(cands, { rvolMin: 2 })
  assert.equal(out.length, 2)
  assert.equal(out[0].simbolo, 'B')   // mejor score primero
})

test('puntuarCandidato premia rvol alto y descuento', () => {
  const alto = puntuarCandidato({ simbolo: 'B', precio: 60, rvol: 3, fundamentales: { valorRazonable: 100 } })
  const bajo = puntuarCandidato({ simbolo: 'A', precio: 98, rvol: 1.1 })
  assert.ok(alto > bajo)
})

test('maxPosRango52 exige estar en la parte baja del rango 52s (proxy libre de barata)', () => {
  const barata: Candidato = { simbolo: 'X', precio: 10, posRango52: 0.15 }
  const cara: Candidato = { simbolo: 'Y', precio: 90, posRango52: 0.9 }
  assert.equal(pasaScreener(barata, { maxPosRango52: 0.5 }).pasa, true)
  assert.equal(pasaScreener(cara, { maxPosRango52: 0.5 }).pasa, false)
  // sin dato de rango tampoco pasa (no se puede afirmar que esté barata)
  assert.equal(pasaScreener({ simbolo: 'Z', precio: 10 }, { maxPosRango52: 0.5 }).pasa, false)
})

test('puntuarCandidato bonifica estar cerca de mínimos de 52s', () => {
  const cerca = puntuarCandidato({ simbolo: 'A', precio: 10, posRango52: 0.05 })
  const lejos = puntuarCandidato({ simbolo: 'B', precio: 10, posRango52: 0.95 })
  assert.ok(cerca > lejos)
})
