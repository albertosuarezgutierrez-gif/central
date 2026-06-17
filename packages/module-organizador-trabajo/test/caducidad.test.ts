import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ordenarPorCaducidad, proximosACaducar } from '../src/caducidad.ts'
import type { ConCaducidad } from '../src/caducidad.ts'

function item(id: string, caduca_at: string): ConCaducidad {
  return { id, nombre: id, caduca_at }
}

test('ordena por caducidad ascendente (FEFO: lo que antes caduca, primero)', () => {
  const r = ordenarPorCaducidad([
    item('b', '2026-06-20T00:00:00.000Z'),
    item('a', '2026-06-18T00:00:00.000Z'),
    item('c', '2026-06-25T00:00:00.000Z'),
  ])
  assert.deepEqual(r.map(x => x.id), ['a', 'b', 'c'])
})

test('no muta el array de entrada', () => {
  const orig = [item('b', '2026-06-20T00:00:00.000Z'), item('a', '2026-06-18T00:00:00.000Z')]
  ordenarPorCaducidad(orig)
  assert.deepEqual(orig.map(x => x.id), ['b', 'a'])
})

test('proximosACaducar: dentro de la ventana de días, ordenados', () => {
  const r = proximosACaducar(
    [
      item('hoy', '2026-06-17T20:00:00.000Z'),
      item('lejos', '2026-07-01T00:00:00.000Z'),
      item('manana', '2026-06-18T09:00:00.000Z'),
    ],
    '2026-06-17T09:00:00.000Z',
    3,
  )
  assert.deepEqual(r.map(x => x.id), ['hoy', 'manana'])
})

test('proximosACaducar: incluye los ya caducados (caducidad pasada)', () => {
  const r = proximosACaducar([item('vencido', '2026-06-15T00:00:00.000Z')], '2026-06-17T09:00:00.000Z', 2)
  assert.deepEqual(r.map(x => x.id), ['vencido'])
})

test('sirve igual para certificados (manipulador) que para lotes', () => {
  const r = proximosACaducar(
    [{ id: 'cert-pepe', nombre: 'Manipulador · Pepe', caduca_at: '2026-06-19T00:00:00.000Z' }],
    '2026-06-17T00:00:00.000Z',
    7,
  )
  assert.deepEqual(r.map(x => x.id), ['cert-pepe'])
})
