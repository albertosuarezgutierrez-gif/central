import { test } from 'node:test'
import assert from 'node:assert/strict'
import { siguienteTarea } from '../src/siguiente.ts'
import type { Tarea, Trabajador, EstadoCarga } from '../src/types.ts'

function tarea(over: Partial<Tarea> = {}): Tarea {
  return { id: 't', nombre: 'x', tipo: 'operativa', duracion_estimada_min: 10, prioridad: 'normal', ...over }
}
const camarero: Trabajador = { id: 'c1', nombre: 'C', rol: 'camarero', disponible: true }
const OCIOSO: EstadoCarga = { nivel: 1, umbral_ocioso: 3 }
const OCUPADO: EstadoCarga = { nivel: 9, umbral_ocioso: 3 }

test('con carga alta no empuja ninguna tarea', () => {
  assert.equal(siguienteTarea(camarero, [tarea()], OCUPADO), null)
})

test('ocioso: devuelve la tarea pendiente que puede hacer', () => {
  const t = siguienteTarea(camarero, [tarea({ id: 'barrer' })], OCIOSO)
  assert.equal(t?.id, 'barrer')
})

test('ocioso: prioridad manda, y a igualdad la más corta primero', () => {
  const t = siguienteTarea(camarero, [
    tarea({ id: 'larga', prioridad: 'normal', duracion_estimada_min: 30 }),
    tarea({ id: 'corta', prioridad: 'normal', duracion_estimada_min: 5 }),
    tarea({ id: 'urge', prioridad: 'urgente', duracion_estimada_min: 60 }),
  ], OCIOSO)
  assert.equal(t?.id, 'urge')
})

test('ocioso pero sin tareas que pueda hacer → null', () => {
  const t = siguienteTarea(camarero, [tarea({ id: 'cocina', requiere_rol: 'cocinero' })], OCIOSO)
  assert.equal(t, null)
})

test('trabajador no disponible → null aunque esté ocioso', () => {
  const t = siguienteTarea({ ...camarero, disponible: false }, [tarea()], OCIOSO)
  assert.equal(t, null)
})

test('ignora tareas no pendientes', () => {
  const t = siguienteTarea(camarero, [tarea({ id: 'a', estado: 'en_proceso' })], OCIOSO)
  assert.equal(t, null)
})
