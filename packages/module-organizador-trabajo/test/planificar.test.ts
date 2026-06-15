import { test } from 'node:test'
import assert from 'node:assert/strict'
import { planificarPorCaducidad } from '../src/planificar.ts'
import type { Tarea } from '../src/types.ts'

function tarea(over: Partial<Tarea> = {}): Tarea {
  return { id: 't', nombre: 'x', tipo: 'elaboracion', duracion_estimada_min: 60, prioridad: 'normal', ...over }
}

test('calcula empezar_antes_de = vence_at − duracion', () => {
  const [p] = planificarPorCaducidad(
    [tarea({ id: 'a', duracion_estimada_min: 60, vence_at: '2026-06-17T12:00:00.000Z' })],
    '2026-06-17T09:00:00.000Z',
  )
  assert.equal(p.empezar_antes_de, '2026-06-17T11:00:00.000Z')
  assert.equal(p.holgura_min, 120) // de 09:00 a 11:00
  assert.equal(p.en_riesgo, false)
})

test('en_riesgo cuando ya no se llega a tiempo', () => {
  const [p] = planificarPorCaducidad(
    [tarea({ id: 'b', duracion_estimada_min: 120, vence_at: '2026-06-17T10:00:00.000Z' })],
    '2026-06-17T09:00:00.000Z', // empezar_antes_de = 08:00 < ahora
  )
  assert.equal(p.holgura_min, -60)
  assert.equal(p.en_riesgo, true)
})

test('tarea sin vencimiento: campos nulos, no en riesgo', () => {
  const [p] = planificarPorCaducidad([tarea({ id: 'c', vence_at: null })], '2026-06-17T09:00:00.000Z')
  assert.equal(p.empezar_antes_de, null)
  assert.equal(p.holgura_min, null)
  assert.equal(p.en_riesgo, false)
})

test('ordena por empezar_antes_de ascendente; las sin vencimiento al final', () => {
  const res = planificarPorCaducidad([
    tarea({ id: 'tarde', duracion_estimada_min: 30, vence_at: '2026-06-17T20:00:00.000Z' }),
    tarea({ id: 'sin', vence_at: null }),
    tarea({ id: 'pronto', duracion_estimada_min: 30, vence_at: '2026-06-17T12:00:00.000Z' }),
  ], '2026-06-17T09:00:00.000Z')
  assert.deepEqual(res.map(r => r.tarea_id), ['pronto', 'tarde', 'sin'])
})
