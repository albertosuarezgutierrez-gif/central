import { test } from 'node:test'
import assert from 'node:assert/strict'
import { construirParte, resumirPartes } from '../src/partes.ts'
import type { Tarea } from '../src/types.ts'

function tarea(over: Partial<Tarea> = {}): Tarea {
  return { id: 't', nombre: 'Cortar queso', tipo: 'elaboracion', duracion_estimada_min: 30, prioridad: 'normal', ...over }
}

test('construirParte con tiempo real calcula la desviación', () => {
  const p = construirParte(tarea({ id: 'a' }), 'w1', 20)
  assert.deepEqual(p, {
    trabajador_id: 'w1', tarea_id: 'a', concepto: 'Cortar queso',
    minutos_estimados: 30, minutos_reales: 20, desviacion_min: -10,
  })
})

test('construirParte sin tiempo real deja real y desviación en null', () => {
  const p = construirParte(tarea({ id: 'b' }), 'w1', null)
  assert.equal(p.minutos_reales, null)
  assert.equal(p.desviacion_min, null)
})

test('resumirPartes agrega por trabajador (real null cuenta como 0)', () => {
  const partes = [
    construirParte(tarea({ id: 'a', duracion_estimada_min: 30 }), 'w1', 20),
    construirParte(tarea({ id: 'b', duracion_estimada_min: 15 }), 'w1', null),
    construirParte(tarea({ id: 'c', duracion_estimada_min: 10 }), 'w2', 12),
  ]
  assert.deepEqual(resumirPartes(partes), [
    { trabajador_id: 'w1', tareas: 2, minutos_estimados: 45, minutos_reales: 20 },
    { trabajador_id: 'w2', tareas: 1, minutos_estimados: 10, minutos_reales: 12 },
  ])
})
