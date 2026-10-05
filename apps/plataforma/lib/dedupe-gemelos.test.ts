import { test } from 'node:test'
import assert from 'node:assert/strict'
import { emparejarGemelos } from './dedupe-gemelos.ts'

const x = (id: string, fecha: string, importe = -170) => ({ id, fecha, importe })

test('cargos recurrentes del mismo importe en días distintos sin gemelo: ninguno es duplicado', () => {
  const xls = ['2026-09-11', '2026-09-14', '2026-09-21', '2026-09-24', '2026-10-01', '2026-10-02'].map((f, i) => x(`x${i}`, f))
  assert.deepEqual(emparejarGemelos(xls, []), [])
  assert.deepEqual(emparejarGemelos(xls, [x('p1', '2026-09-10', -76.5), x('p2', '2026-09-10')]), [])
})

test('dos cargos iguales el mismo día con UN solo gemelo: solo uno se empareja', () => {
  const r = emparejarGemelos([x('a', '2026-09-11'), x('b', '2026-09-11')], [x('p', '2026-09-11')])
  assert.equal(r.length, 1)
  assert.equal(r[0].feedId, 'p')
})

test('un gemelo no se reutiliza: 2 xls + 2 psd2 mismo día = 2 pares distintos', () => {
  const r = emparejarGemelos([x('a', '2026-09-11'), x('b', '2026-09-11')], [x('p', '2026-09-11'), x('q', '2026-09-11')])
  assert.equal(new Set(r.map(p => p.feedId)).size, 2)
})

test('mismo importe en días distintos con un gemelo: solo el de su día (-76,50 del 07/09 y 10/09)', () => {
  const r = emparejarGemelos([x('a', '2026-09-07', -76.5), x('b', '2026-09-10', -76.5)], [x('p', '2026-09-10', -76.5)])
  assert.deepEqual(r, [{ importadoId: 'b', feedId: 'p' }])
})

test('la tolerancia es opcional y elige el gemelo más cercano', () => {
  const r = emparejarGemelos([x('a', '2026-09-11')], [x('p', '2026-09-13'), x('q', '2026-09-12')], 2)
  assert.deepEqual(r, [{ importadoId: 'a', feedId: 'q' }])
})
