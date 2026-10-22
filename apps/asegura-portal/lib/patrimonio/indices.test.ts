import { test } from 'node:test'
import assert from 'node:assert/strict'

import type { Contrato } from '@central/module-patrimonio'

import { confirmarAplicacion, elegirVariacion, periodoReferencia, propuestaRenta, type FilaIndice } from './indices.ts'

const contrato = (over: Partial<Contrato> = {}): Contrato => ({
  id: 'c1',
  inmuebleId: 'i1',
  inquilinoIds: [],
  inicio: '2025-11-01',
  fin: null,
  terminadoEn: null,
  rentaMensual: 100_000,
  clausula: { tipo: 'indice', indice: 'IRAV' },
  actualizaciones: [],
  fianza: null,
  seguroInquilino: null,
  ...over,
})
const fila = (indice: string, periodo: string, pct: number, descargadoEn = '2026-10-15T08:00:00Z'): FilaIndice => ({
  indice,
  periodo,
  pct,
  descargadoEn: new Date(descargadoEn),
})
const HOY = '2026-10-20' // a 12 días del aniversario 2026-11-01

test('periodo de referencia = mes anterior al del aniversario (también en enero)', () => {
  assert.equal(periodoReferencia('2026-11-01'), '2026-10')
  assert.equal(periodoReferencia('2027-01-15'), '2026-12')
})

test('🚨 sin cláusula NO propone, aunque haya índice', () => {
  const r = propuestaRenta(contrato({ clausula: { tipo: 'ninguna' } }), [fila('IRAV', '2026-10', 2)], HOY)
  assert.equal(r.estado, 'sin_clausula')
})

test('🚨 índice distinto al del contrato: un IPC no sirve para un contrato IRAV → sin_indice (nunca «el que haya»)', () => {
  const r = propuestaRenta(contrato(), [fila('IPC', '2026-10', 3)], HOY)
  assert.equal(r.estado, 'sin_indice')
  assert.equal(elegirVariacion([fila('IPC', '2026-10', 3)], 'IRAV', '2026-11-01'), null)
})

test('índice ausente → sin_indice; contrato «otro» no tiene tabla → sin_indice', () => {
  assert.equal(propuestaRenta(contrato(), [], HOY).estado, 'sin_indice')
  const otro = contrato({ clausula: { tipo: 'indice', indice: 'otro', descripcion: 'IGC' } })
  assert.equal(propuestaRenta(otro, [fila('IPC', '2026-10', 3), fila('IRAV', '2026-10', 2)], HOY).estado, 'sin_indice')
})

test('🚨 índice VIEJO (cron mudo) = sin_indice, no una propuesta con un IPC de hace medio año', () => {
  assert.equal(propuestaRenta(contrato(), [fila('IRAV', '2026-04', 2)], HOY).estado, 'sin_indice')
  // Dentro del margen (2 meses) sí vale.
  const r = propuestaRenta(contrato(), [fila('IRAV', '2026-08', 2)], HOY)
  assert.equal(r.estado, 'propuesta')
})

test('se toma el periodo más reciente ≤ referencia; uno POSTERIOR al aniversario no cuenta', () => {
  const v = elegirVariacion([fila('IRAV', '2026-09', 1.5), fila('IRAV', '2026-10', 2), fila('IRAV', '2026-11', 9)], 'IRAV', '2026-11-01')
  assert.deepEqual(v, { indice: 'IRAV', pct: 2, periodo: '2026-10' })
})

test('revisión del INE: manda la fila más reciente por descargadoEn', () => {
  const v = elegirVariacion(
    [fila('IRAV', '2026-10', 2, '2026-10-15T08:00:00Z'), fila('IRAV', '2026-10', 2.2, '2026-10-20T08:00:00Z')],
    'IRAV',
    '2026-11-01',
  )
  assert.equal(v?.pct, 2.2)
})

test('propuesta con el índice del contrato: céntimos enteros', () => {
  const r = propuestaRenta(contrato(), [fila('IRAV', '2026-10', 2.95)], HOY)
  assert.equal(r.estado, 'propuesta')
  if (r.estado !== 'propuesta') return
  assert.equal(r.aplicableDesde, '2026-11-01')
  assert.equal(r.rentaActual, 100_000)
  assert.equal(r.rentaNueva, 102_950)
  assert.equal(r.indice, 'IRAV')
  assert.equal(r.periodo, '2026-10')
})

test('aplicar: el cuerpo CONFIRMA lo propuesto; índice distinto rechaza; renta tocada rechaza', () => {
  const p = propuestaRenta(contrato(), [fila('IRAV', '2026-10', 2.95)], HOY)
  const ok = { desde: '2026-11-01', rentaNuevaCent: 102_950, indice: 'IRAV', periodo: '2026-10' }
  assert.equal(confirmarAplicacion(ok, p).ok, true)
  assert.deepEqual(confirmarAplicacion({ ...ok, indice: 'IPC' }, p), { ok: false, error: 'indice_distinto' })
  assert.deepEqual(confirmarAplicacion({ ...ok, rentaNuevaCent: 150_000 }, p), { ok: false, error: 'propuesta_cambiada' })
  assert.deepEqual(confirmarAplicacion({ ...ok, desde: '2026-12-01' }, p), { ok: false, error: 'propuesta_cambiada' })
  assert.deepEqual(confirmarAplicacion({ ...ok, rentaNuevaCent: '102950' }, p), { ok: false, error: 'datos_invalidos' })
  // Sin cláusula no hay nada que aplicar, diga lo que diga el cuerpo.
  const sin = propuestaRenta(contrato({ clausula: { tipo: 'ninguna' } }), [], HOY)
  assert.deepEqual(confirmarAplicacion(ok, sin), { ok: false, error: 'sin_clausula' })
  assert.deepEqual(confirmarAplicacion(ok, propuestaRenta(contrato(), [], HOY)), { ok: false, error: 'sin_indice' })
})
