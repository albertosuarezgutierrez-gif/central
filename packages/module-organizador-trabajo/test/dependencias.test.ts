import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  tareasDesbloqueadas,
  tareasBloqueadas,
  avisosAlCompletar,
} from '../src/dependencias.ts'
import type { Tarea } from '../src/types.ts'

function tarea(over: Partial<Tarea> = {}): Tarea {
  return { id: 't', nombre: 'x', tipo: 'elaboracion', duracion_estimada_min: 30, prioridad: 'normal', ...over }
}

// ─── tareasDesbloqueadas ─────────────────────────────────────
test('sin dependencias: la tarea está desbloqueada', () => {
  const r = tareasDesbloqueadas([tarea({ id: 'a' })])
  assert.deepEqual(r.map(t => t.id), ['a'])
})

test('prerequisito pendiente: la tarea está bloqueada', () => {
  const r = tareasDesbloqueadas([
    tarea({ id: 'patata' }),
    tarea({ id: 'ensaladilla', depende_de: ['patata'] }),
  ])
  assert.deepEqual(r.map(t => t.id), ['patata'])
})

test('prerequisito hecho: la tarea queda desbloqueada', () => {
  const r = tareasDesbloqueadas([
    tarea({ id: 'patata', estado: 'hecha' }),
    tarea({ id: 'ensaladilla', depende_de: ['patata'] }),
  ])
  assert.deepEqual(r.map(t => t.id), ['ensaladilla'])
})

test('varios prerequisitos: bloqueada hasta que TODOS estén hechos', () => {
  const base = [
    tarea({ id: 'patata', estado: 'hecha' }),
    tarea({ id: 'huevo', estado: 'pendiente' }),
    tarea({ id: 'ensaladilla', depende_de: ['patata', 'huevo'] }),
  ]
  assert.deepEqual(tareasDesbloqueadas(base).map(t => t.id), ['huevo'])
})

test('prerequisito inexistente se considera NO cumplido (seguridad)', () => {
  const r = tareasDesbloqueadas([tarea({ id: 'a', depende_de: ['fantasma'] })])
  assert.deepEqual(r, [])
})

test('ignora tareas no pendientes', () => {
  const r = tareasDesbloqueadas([tarea({ id: 'a', estado: 'en_proceso' })])
  assert.deepEqual(r, [])
})

// ─── tareasBloqueadas ────────────────────────────────────────
test('lista las bloqueadas con los prerequisitos que faltan', () => {
  const r = tareasBloqueadas([
    tarea({ id: 'patata', estado: 'hecha' }),
    tarea({ id: 'huevo', estado: 'pendiente' }),
    tarea({ id: 'ensaladilla', depende_de: ['patata', 'huevo'] }),
  ])
  assert.deepEqual(r, [{ tarea_id: 'ensaladilla', faltan: ['huevo'] }])
})

// ─── avisosAlCompletar ───────────────────────────────────────
test('completar el último prerequisito desbloquea y avisa', () => {
  const tareas = [
    tarea({ id: 'patata', nombre: 'Cocer patata' }),
    tarea({ id: 'ensaladilla', nombre: 'Montar ensaladilla', tipo: 'elaboracion', depende_de: ['patata'] }),
  ]
  const avisos = avisosAlCompletar('patata', tareas)
  assert.equal(avisos.length, 1)
  assert.equal(avisos[0].tarea_id, 'ensaladilla')
  assert.equal(avisos[0].desbloqueada_por, 'patata')
  assert.match(avisos[0].mensaje, /Montar ensaladilla/)
})

test('si aún faltan otros prerequisitos, completar uno NO avisa', () => {
  const tareas = [
    tarea({ id: 'patata' }),
    tarea({ id: 'huevo' }),
    tarea({ id: 'ensaladilla', depende_de: ['patata', 'huevo'] }),
  ]
  // se completa patata, pero huevo sigue pendiente → no se desbloquea aún
  assert.deepEqual(avisosAlCompletar('patata', tareas), [])
})

test('una tarea que ya estaba desbloqueada no genera aviso duplicado', () => {
  const tareas = [
    tarea({ id: 'a' }),
    tarea({ id: 'b' }), // sin dependencia de 'a' → ya estaba lista
  ]
  assert.deepEqual(avisosAlCompletar('a', tareas), [])
})

test('completar destraba varias a la vez', () => {
  const tareas = [
    tarea({ id: 'fondo', nombre: 'Fondo de arroz' }),
    tarea({ id: 'arroz1', nombre: 'Arroz negro', depende_de: ['fondo'] }),
    tarea({ id: 'arroz2', nombre: 'Arroz marinera', depende_de: ['fondo'] }),
  ]
  const avisos = avisosAlCompletar('fondo', tareas)
  assert.deepEqual(avisos.map(a => a.tarea_id).sort(), ['arroz1', 'arroz2'])
})
