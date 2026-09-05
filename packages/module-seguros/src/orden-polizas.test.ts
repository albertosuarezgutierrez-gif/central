import test from 'node:test'
import assert from 'node:assert/strict'
import { ordenPolizasFicha, type PolizaOrdenable } from './orden-polizas.ts'

const p = (viva: boolean, fechaVencimiento: string | null): PolizaOrdenable => ({ viva, fechaVencimiento })

test('lo vivo va primero, aunque lo histórico tenga fecha y lo vivo no', () => {
  const lista = [p(false, '2016-03-03'), p(true, null), p(false, null), p(true, '2026-09-24')]
  const orden = [...lista].sort(ordenPolizasFicha)
  assert.deepEqual(orden.map(x => x.viva), [true, true, false, false])
})

test('dentro del grupo, lo que vence ANTES va arriba', () => {
  const orden = [p(true, '2027-07-06'), p(true, '2026-09-24'), p(true, '2026-11-12')].sort(ordenPolizasFicha)
  assert.deepEqual(orden.map(x => x.fechaVencimiento), ['2026-09-24', '2026-11-12', '2027-07-06'])
})

test('🚨 sin fecha va al FINAL de su grupo, no al principio', () => {
  // Es el bug que esto arregla: `ORDER BY fecha DESC` en Postgres pone los NULL
  // primero, así que las 15 pólizas del volcado sepultaban a las vivas.
  const orden = [p(true, null), p(true, '2026-09-24'), p(true, null), p(true, '2027-07-06')].sort(ordenPolizasFicha)
  assert.deepEqual(orden.map(x => x.fechaVencimiento), ['2026-09-24', '2027-07-06', null, null])
})

test('el caso real de la ficha del 05/09/2026: ninguna histórica por delante de una viva', () => {
  // 6 vivas (5 con fecha) y 15 del volcado (13 sin fecha) — la forma exacta que
  // dejaba ocho filas vacías arriba.
  const vivas = [p(true, '2026-09-24'), p(true, '2026-11-12'), p(true, '2025-03-06'), p(true, '2027-07-06'), p(true, '2027-09-30'), p(true, '2024-06-28')]
  const historicas = [p(false, '2016-03-03'), p(false, '2014-11-27'), p(false, '2015-11-27'), ...Array.from({ length: 12 }, () => p(false, null))]
  const orden = [...historicas, ...vivas].sort(ordenPolizasFicha)
  assert.equal(orden.length, 21)
  assert.ok(orden.slice(0, 6).every(x => x.viva), 'las 6 primeras tienen que ser las vivas')
  assert.equal(orden[0].fechaVencimiento, '2024-06-28', 'y la primera, la que vence antes')
  assert.ok(orden.slice(6).every(x => !x.viva))
})

test('el comparador es estable con listas de un elemento o vacías', () => {
  assert.deepEqual([].sort(ordenPolizasFicha), [])
  const una = [p(false, null)]
  assert.deepEqual([...una].sort(ordenPolizasFicha), una)
})
