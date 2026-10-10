import test from 'node:test'
import assert from 'node:assert/strict'
import { ordenarPorInteres, type ParaOrdenar } from './orden-hallazgos.ts'

type H = ParaOrdenar & { id: string }
const h = (id: string, oportunidadesAbiertas: number | null, vitalidad: ParaOrdenar['vitalidad']): H =>
  ({ id, oportunidadesAbiertas, vitalidad })

test('primero con oportunidad activa, luego cartera viva, al final el volcado', () => {
  const r = ordenarPorInteres([h('a', 0, 'historica'), h('b', 0, 'viva'), h('c', 1, 'historica')])
  assert.deepEqual(r.map((x) => x.id), ['c', 'b', 'a'])
})

test('🚨 «no se sabe» no sube: null no cuenta como oportunidad ni desconocida como viva', () => {
  const r = ordenarPorInteres([h('nulo', null, 'desconocida'), h('viva', 0, 'viva'), h('op', 2, 'viva')])
  assert.deepEqual(r.map((x) => x.id), ['op', 'viva', 'nulo'])
})

test('a igualdad se conserva el orden de la consulta', () => {
  const r = ordenarPorInteres([h('x', 0, 'viva'), h('y', 0, 'viva'), h('z', 0, 'viva')])
  assert.deepEqual(r.map((x) => x.id), ['x', 'y', 'z'])
})
