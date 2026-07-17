import { test } from 'node:test'
import assert from 'node:assert/strict'
import { puntuarTesis, agregarStats } from '../src/scoring.ts'
import type { Tesis } from '../src/types.ts'

const tesis = (over: Partial<Tesis> = {}): Tesis => ({
  simbolo: 'X', fecha: '2026-07-01', estrategia: 'momentum', direccion: 'alcista',
  confianza: 70, horizonteDias: 10, precioRef: 100,
  indicadores: {} as any, rationale: '', ...over,
})

test('puntuarTesis acierta si alcista y el precio subió', () => {
  const r = puntuarTesis(tesis(), 110)
  assert.equal(r.acierto, true)
  assert.ok(Math.abs(r.retorno - 0.1) < 1e-9)
})

test('puntuarTesis falla si alcista y el precio bajó', () => {
  assert.equal(puntuarTesis(tesis(), 95).acierto, false)
})

test('bajista acierta si el precio bajó', () => {
  assert.equal(puntuarTesis(tesis({ direccion: 'bajista' }), 95).acierto, true)
})

test('agregarStats calcula hit-rate por estrategia', () => {
  const stats = agregarStats([
    { estrategia: 'momentum', acierto: true, retorno: 0.1 },
    { estrategia: 'momentum', acierto: false, retorno: -0.05 },
    { estrategia: 'valor', acierto: true, retorno: 0.2 },
  ])
  assert.equal(stats.momentum.hitRate, 0.5)
  assert.equal(stats.valor.hitRate, 1)
})
