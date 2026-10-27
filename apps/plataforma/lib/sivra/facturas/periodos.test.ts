import { test } from 'node:test'
import assert from 'node:assert'
import { rangoPeriodo, periodoDeQuery } from './periodos.ts'
import { libroCsv, totalesLibro, celdaCsv } from './csv.ts'

test('rangos con fin exclusivo', () => {
  assert.deepEqual(rangoPeriodo({ tipo: 'mes', anio: 2026, mes: 2 }), { desde: '2026-02-01', hasta: '2026-03-01' })
  assert.deepEqual(rangoPeriodo({ tipo: 'mes', anio: 2026, mes: 12 }), { desde: '2026-12-01', hasta: '2027-01-01' })
  assert.deepEqual(rangoPeriodo({ tipo: 'trimestre', anio: 2026, trimestre: 3 }), { desde: '2026-07-01', hasta: '2026-10-01' })
  assert.deepEqual(rangoPeriodo({ tipo: 'trimestre', anio: 2026, trimestre: 4 }), { desde: '2026-10-01', hasta: '2027-01-01' })
  assert.deepEqual(rangoPeriodo({ tipo: 'anio', anio: 2026 }), { desde: '2026-01-01', hasta: '2027-01-01' })
  assert.deepEqual(rangoPeriodo({ tipo: 'personalizado', desde: '2026-06-01', hasta: '2026-09-30' }), { desde: '2026-06-01', hasta: '2026-10-01' })
})

test('periodos mal formados → null (400), no un listado vacío', () => {
  assert.equal(rangoPeriodo({ tipo: 'mes', anio: 2026, mes: 13 }), null)
  assert.equal(rangoPeriodo({ tipo: 'trimestre', anio: 2026, trimestre: 0 }), null)
  assert.equal(rangoPeriodo({ tipo: 'anio', anio: NaN }), null)
  assert.equal(rangoPeriodo({ tipo: 'personalizado', desde: '2026-09-30', hasta: '2026-06-01' }), null)
  assert.equal(rangoPeriodo({ tipo: 'personalizado', desde: '2026-02-30', hasta: '2026-03-01' }), null)
  assert.equal(periodoDeQuery(new URLSearchParams('periodo=semana')), null)
})

const FILA = { numeroCompleto: 'HS-2026-0001', fechaExpedicion: '2026-10-27', estado: 'enviada', piso: 'House sevillana', reservationId: '1', receptorNombre: '=HYPERLINK("x")', receptorNif: 'B1', receptorPais: 'ES', base: 1622.82, tipoIva: 10, cuota: 162.28, total: 1785.1 }

test('CSV: «;», coma decimal, BOM y sin inyección de fórmulas', () => {
  const csv = libroCsv([FILA])
  assert.ok(csv.startsWith('﻿Número;'))
  assert.match(csv, /;1622,82;10,00;162,28;1785,10\r\n$/)
  assert.match(csv, /"'=HYPERLINK\(""x""\)"/)
  assert.equal(celdaCsv('+34'), "'+34")
})

test('totales: solo emitidas/enviadas, al céntimo', () => {
  const t = totalesLibro([FILA, { ...FILA, estado: 'borrador', base: null, cuota: null, total: 999 }, { ...FILA, estado: 'emitida', base: 0.1, cuota: 0.2, total: 0.3 }])
  assert.deepEqual(t, { base: 1622.92, cuota: 162.48, total: 1785.4, n: 2 })
})
