import { test } from 'node:test'
import assert from 'node:assert/strict'
import { asignarTrabajo } from '../src/asignar.ts'
import type { Tarea, Trabajador } from '../src/types.ts'

function tarea(over: Partial<Tarea> = {}): Tarea {
  return { id: 't', nombre: 'x', tipo: 'elaboracion', duracion_estimada_min: 30, prioridad: 'normal', ...over }
}
function trab(over: Partial<Trabajador> = {}): Trabajador {
  return { id: 'w', nombre: 'W', rol: 'cocinero', disponible: true, ...over }
}

test('reparte equilibrando minutos imputados (equidad de carga)', () => {
  const plan = asignarTrabajo(
    [tarea({ id: 'a', duracion_estimada_min: 60 }), tarea({ id: 'b', duracion_estimada_min: 30 })],
    [trab({ id: 'w1' }), trab({ id: 'w2' })],
  )
  // a (más prioritaria por orden estable) → w1; b → w2 (el de menos carga)
  assert.deepEqual(plan.asignaciones, [
    { trabajador_id: 'w1', tarea_id: 'a' },
    { trabajador_id: 'w2', tarea_id: 'b' },
  ])
  assert.deepEqual(plan.minutos_por_trabajador, { w1: 60, w2: 30 })
  assert.deepEqual(plan.sin_asignar, [])
})

test('respeta requiere_rol y deja sin asignar si nadie puede', () => {
  const plan = asignarTrabajo(
    [tarea({ id: 'a', requiere_rol: 'pastelero' })],
    [trab({ id: 'w1', rol: 'cocinero' })],
  )
  assert.deepEqual(plan.asignaciones, [])
  assert.deepEqual(plan.sin_asignar, ['a'])
})

test('un trabajador con capacidad extra (roles) cubre el rol requerido', () => {
  const plan = asignarTrabajo(
    [tarea({ id: 'a', requiere_rol: 'pastelero' })],
    [trab({ id: 'w1', rol: 'cocinero', roles: ['pastelero'] })],
  )
  assert.deepEqual(plan.asignaciones, [{ trabajador_id: 'w1', tarea_id: 'a' }])
})

test('prioridad manda sobre el orden de entrada', () => {
  const plan = asignarTrabajo(
    [tarea({ id: 'baja', prioridad: 'baja' }), tarea({ id: 'urge', prioridad: 'urgente' })],
    [trab({ id: 'w1' })],
  )
  // urge se asigna primero aunque venga después
  assert.deepEqual(plan.asignaciones.map(a => a.tarea_id), ['urge', 'baja'])
})

test('ignora tareas ya hechas y trabajadores no disponibles', () => {
  const plan = asignarTrabajo(
    [tarea({ id: 'a' }), tarea({ id: 'hecha', estado: 'hecha' })],
    [trab({ id: 'w1', disponible: false }), trab({ id: 'w2', disponible: true })],
  )
  assert.deepEqual(plan.asignaciones, [{ trabajador_id: 'w2', tarea_id: 'a' }])
})
