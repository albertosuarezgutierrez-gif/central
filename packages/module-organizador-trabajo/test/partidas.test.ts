import { test } from 'node:test'
import assert from 'node:assert/strict'
import { agruparPorPartida } from '../src/partidas.ts'
import type { Tarea } from '../src/types.ts'

function tarea(over: Partial<Tarea> = {}): Tarea {
  return { id: 't', nombre: 'x', tipo: 'elaboracion', duracion_estimada_min: 30, prioridad: 'normal', ...over }
}

test('agrupa por partida en orden de primera aparición y suma minutos', () => {
  const r = agruparPorPartida([
    tarea({ id: 'a', partida: 'frio', duracion_estimada_min: 20 }),
    tarea({ id: 'b', partida: 'caliente', duracion_estimada_min: 40 }),
    tarea({ id: 'c', partida: 'frio', duracion_estimada_min: 10 }),
  ])
  assert.deepEqual(r.map(p => p.partida), ['frio', 'caliente'])
  assert.deepEqual(r[0].tareas.map(t => t.id), ['a', 'c'])
  assert.equal(r[0].minutos_estimados, 30)
  assert.equal(r[1].minutos_estimados, 40)
})

test('tareas sin partida van a "sin_partida"', () => {
  const r = agruparPorPartida([tarea({ id: 'a' }), tarea({ id: 'b', partida: null })])
  assert.deepEqual(r.map(p => p.partida), ['sin_partida'])
  assert.equal(r[0].tareas.length, 2)
})

test('solo cuenta minutos de tareas pendientes (las hechas/en proceso no cargan)', () => {
  const r = agruparPorPartida([
    tarea({ id: 'a', partida: 'frio', duracion_estimada_min: 20 }),
    tarea({ id: 'b', partida: 'frio', duracion_estimada_min: 40, estado: 'hecha' }),
  ])
  assert.equal(r[0].minutos_estimados, 20)
  assert.equal(r[0].tareas.length, 2) // las lista todas, pero solo suma pendientes
})

test('lista vacía → sin partidas', () => {
  assert.deepEqual(agruparPorPartida([]), [])
})
