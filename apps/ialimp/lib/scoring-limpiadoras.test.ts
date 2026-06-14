// Tests de la lógica PURA de scoring de limpiadoras. Runner: `node --test`.
import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  puntuarLimpiadora,
  rankingLimpiadoras,
  PESO_CALIDAD,
  PESO_FIABILIDAD,
  type RendimientoLimpiadora,
} from './scoring-limpiadoras.ts'

test('rating perfecto y sin quejas → 100', () => {
  const p = puntuarLimpiadora({ limpiadora_id: 'a', limpiadora_nombre: 'Ana', total_sesiones: 20, total_quejas: 0, rating_medio: 5 })
  assert.equal(p.score, 100)
  assert.equal(p.sin_valoraciones, false)
  assert.equal(p.confianza, 'alta')
})

test('las quejas bajan la fiabilidad de forma proporcional', () => {
  // 5 quejas / 10 sesiones → ratio 0.5 → fiabilidad 0.5
  const p = puntuarLimpiadora({ limpiadora_id: 'b', limpiadora_nombre: 'Bea', total_sesiones: 10, total_quejas: 5, rating_medio: 5 })
  // calidad 1×0.55 + fiabilidad 0.5×0.45 = 0.775 → 78
  assert.equal(p.desglose.fiabilidad, 0.5)
  assert.equal(p.score, Math.round((1 * PESO_CALIDAD + 0.5 * PESO_FIABILIDAD) * 100))
})

test('sin valoraciones: no penaliza a 0, score = fiabilidad y se marca', () => {
  const p = puntuarLimpiadora({ limpiadora_id: 'c', limpiadora_nombre: 'Cris', total_sesiones: 9, total_quejas: 0, rating_medio: null })
  assert.equal(p.sin_valoraciones, true)
  assert.equal(p.desglose.calidad, null)
  assert.equal(p.score, 100) // fiabilidad 1 (0 quejas)
  assert.equal(p.confianza, 'media')
})

test('ratio de quejas se satura en 1 (fiabilidad nunca negativa)', () => {
  const p = puntuarLimpiadora({ limpiadora_id: 'd', limpiadora_nombre: 'Dani', total_sesiones: 2, total_quejas: 5, rating_medio: null })
  assert.equal(p.desglose.fiabilidad, 0)
  assert.equal(p.score, 0)
  assert.equal(p.confianza, 'baja')
})

test('ranking ordena por score y asigna posición; desempata por sesiones', () => {
  const filas: RendimientoLimpiadora[] = [
    { limpiadora_id: 'x', limpiadora_nombre: 'X', total_sesiones: 10, total_quejas: 3, rating_medio: 4 },
    { limpiadora_id: 'y', limpiadora_nombre: 'Y', total_sesiones: 20, total_quejas: 0, rating_medio: 5 },
    { limpiadora_id: 'z1', limpiadora_nombre: 'Z1', total_sesiones: 5, total_quejas: 0, rating_medio: 5 },
    { limpiadora_id: 'z2', limpiadora_nombre: 'Z2', total_sesiones: 30, total_quejas: 0, rating_medio: 5 },
  ]
  const r = rankingLimpiadoras(filas)
  // y, z1, z2 todas 100 → desempata por sesiones: z2(30) > y(20) > z1(5)
  assert.equal(r[0].limpiadora_id, 'z2')
  assert.equal(r[1].limpiadora_id, 'y')
  assert.equal(r[2].limpiadora_id, 'z1')
  assert.equal(r[3].limpiadora_id, 'x') // la de peor score, última
  assert.deepEqual(r.map(l => l.posicion), [1, 2, 3, 4])
})

void PESO_FIABILIDAD
