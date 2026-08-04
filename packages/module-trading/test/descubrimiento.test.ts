import { test } from 'node:test'
import assert from 'node:assert/strict'
import { dedupCandidatos, puntuarDescubrimiento, descubrir } from '../src/descubrimiento.ts'
import type { Candidato } from '../src/types.ts'

test('dedupCandidatos funde por símbolo y une fuentes', () => {
  const out = dedupCandidatos([
    { simbolo: 'IONQ', precio: 35, rvol: 2.1, fuentes: ['tema:Quantum'] },
    { simbolo: 'IONQ', precio: 35, rvol: 1.5, fuentes: ['volumen'], fundamentales: { per: 40 } },
  ])
  assert.equal(out.length, 1)
  assert.deepEqual(out[0].fuentes?.sort(), ['tema:Quantum', 'volumen'])
  assert.equal(out[0].rvol, 2.1)                 // se queda con el mayor
  assert.equal(out[0].fundamentales?.per, 40)
})

test('multi-fuente puntúa más que fuente única', () => {
  const multi = puntuarDescubrimiento({ simbolo: 'A', precio: 10, fuentes: ['tema:X', 'volumen', 'screener'] })
  const uno = puntuarDescubrimiento({ simbolo: 'B', precio: 10, fuentes: ['tema:X'] })
  assert.ok(multi > uno)
})

test('la volatilidad extrema RESTA score (lección de la cartera real)', () => {
  const tranquilo = puntuarDescubrimiento({ simbolo: 'CEG', precio: 250, rvol: 1.5, volAnual: 0.41 })
  const loteria = puntuarDescubrimiento({ simbolo: 'RGTI', precio: 14, rvol: 1.5, volAnual: 0.98 })
  assert.ok(tranquilo > loteria)
})

test('descubrir descarta la lotería con maxVolAnual y ordena por score', () => {
  const cands: Candidato[] = [
    { simbolo: 'RGTI', precio: 14, rvol: 3, volAnual: 0.98, fuentes: ['tema:Quantum'] },   // fuera por vol
    { simbolo: 'BWXT', precio: 173, rvol: 2.2, volAnual: 0.42, fuentes: ['tema:Nuclear'], fundamentales: { valorRazonable: 210 } },
    { simbolo: 'CEG', precio: 250, rvol: 1.1, volAnual: 0.41, fuentes: ['tema:Nuclear'] },
  ]
  const out = descubrir(cands, { maxVolAnual: 0.8 })
  assert.equal(out.length, 2)                    // RGTI descartada
  assert.equal(out[0].simbolo, 'BWXT')           // mejor score (rvol alto + descuento)
  assert.ok(!out.some(c => c.simbolo === 'RGTI'))
})
