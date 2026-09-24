import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ordenarHistorialRiesgo, type EslabonRiesgo } from './historial-riesgo.ts'

const e = (id: string, inicio: string | null, via: EslabonRiesgo['via'] = 'enlace'): EslabonRiesgo => ({
  id, aseguradora: 'X', numeroPoliza: id, fechaInicio: inicio, fechaVencimiento: null, estado: 'activa', sustituida: false, viva: true, via,
})

test('de la más antigua a la más reciente, y marca la que se está mirando', () => {
  const h = ordenarHistorialRiesgo([e('c', '2026-05-01'), e('a', '2024-05-01'), e('b', '2025-05-01')], 'b')
  assert.deepEqual(h.map((x) => x.id), ['a', 'b', 'c'])
  assert.deepEqual(h.map((x) => x.actual), [false, true, false])
})

test('una fecha que no se sabe va al final, no al principio', () => {
  assert.deepEqual(ordenarHistorialRiesgo([e('sin', null), e('a', '2024-01-01')], 'a').map((x) => x.id), ['a', 'sin'])
})

test('sin duplicados, y el enlace explícito gana a la coincidencia de matrícula', () => {
  const h = ordenarHistorialRiesgo([e('a', '2024-01-01', 'matricula'), e('a', '2024-01-01', 'enlace'), e('b', '2025-01-01')], 'b')
  assert.equal(h.length, 2)
  assert.equal(h[0]!.via, 'enlace')
})

test('con una sola póliza no hay historial que enseñar', () => {
  assert.deepEqual(ordenarHistorialRiesgo([e('a', '2024-01-01')], 'a'), [])
  assert.deepEqual(ordenarHistorialRiesgo([e('a', '2024-01-01'), e('b', '2025-01-01')], 'z'), [])
})

test('🚨 la copia del volcado de la MISMA póliza no es otro eslabón (caso Kona: 0007001518236 / 7001518236)', () => {
  const cima = { ...e('cima', '2020-09-24', 'matricula'), aseguradora: 'Mapfre', numeroPoliza: '0007001518236' }
  const volcado = { ...e('volc', '2020-09-24', 'matricula'), aseguradora: 'Mapfre', numeroPoliza: '7001518236', viva: false }
  const reale = { ...e('reale', '2026-09-22'), aseguradora: 'Reale', numeroPoliza: '3022600334066' }
  const h = ordenarHistorialRiesgo([volcado, cima, reale], 'reale')
  assert.deepEqual(h.map((x) => x.id), ['cima', 'reale'])
})
