import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  PATRON_REFERENCIA,
  admiteEmitir,
  conjuntoEnDocumento,
  elegirReutilizable,
  esReferenciaPresupuesto,
  estadoReferencia,
  formatearReferencia,
  mismoConjunto,
  normalizarReferencia,
} from './referencia-presupuesto.ts'

const HOY = new Date('2026-09-30T10:00:00Z')
const MANANA = '2026-10-01T00:00:00Z'
const AYER = '2026-09-29T00:00:00Z'

test('formato canónico AS-AA-NNNN', () => {
  assert.equal(formatearReferencia(2026, 42), 'AS-26-0042')
  assert.equal(formatearReferencia(26, 1), 'AS-26-0001')
  assert.equal(formatearReferencia(2027, 12345), 'AS-27-12345')
  assert.equal(formatearReferencia(2026, 0), null)
  assert.match(formatearReferencia(2026, 7)!, PATRON_REFERENCIA)
})

test('lo que se teclea en el buscador: minúsculas, espacios y guiones', () => {
  for (const q of ['AS-26-0042', 'as-26-0042', ' as 26 42 ', 'AS 26-42', 'as260042', 'AS.26.0042', 'AS–26–0042', 'as/26/42']) {
    assert.equal(normalizarReferencia(q), 'AS-26-0042', q)
  }
  assert.equal(normalizarReferencia('AS-26-12345'), 'AS-26-12345')
})

test('lo que NO es una referencia no se adivina', () => {
  for (const q of ['AS2642', 'AS-26', 'AS-26-0000', 'BS-26-0042', 'Asensio', '5655DSM', '40821944', '', null, 42]) {
    assert.equal(normalizarReferencia(q), null, String(q))
    assert.equal(esReferenciaPresupuesto(q), false)
  }
})

test('estado: retirado y emitido mandan; caducado manda sobre aceptado', () => {
  assert.equal(estadoReferencia({ venceEl: MANANA, retiradoAt: AYER, emitidoAt: AYER }, HOY), 'retirado')
  assert.equal(estadoReferencia({ venceEl: AYER, emitidoAt: AYER }, HOY), 'emitido')
  assert.equal(estadoReferencia({ venceEl: AYER, aceptadoAt: AYER }, HOY), 'caducado')
  assert.equal(estadoReferencia({ venceEl: MANANA, aceptadoAt: AYER }, HOY), 'aceptado')
})

test('estado: fecha ilegible = caducado (no se da por vigente)', () => {
  assert.equal(estadoReferencia({ venceEl: 'basura' }, HOY), 'caducado')
})

test('estado: PDF descargado ≠ enviado; enlazado ≠ enviado', () => {
  assert.equal(estadoReferencia({ venceEl: MANANA }, HOY), 'preparado')
  assert.equal(estadoReferencia({ venceEl: MANANA, documentoDescargadoAt: AYER }, HOY), 'descargado')
  assert.equal(estadoReferencia({ venceEl: MANANA, enlaceGeneradoAt: AYER, documentoDescargadoAt: AYER }, HOY), 'enlazado')
  assert.equal(estadoReferencia({ venceEl: MANANA, enviadoAt: AYER }, HOY), 'enviado')
})

test('emitir solo con el precio vivo', () => {
  assert.equal(admiteEmitir('caducado'), false)
  assert.equal(admiteEmitir('retirado'), false)
  assert.equal(admiteEmitir('emitido'), false)
  assert.equal(admiteEmitir('descargado'), true)
  assert.equal(admiteEmitir('aceptado'), true)
})

test('conjunto en documento: solo las visibles, y sin precio_id no se sabe', () => {
  assert.deepEqual(
    conjuntoEnDocumento([{ precioId: 'B', oculta: false }, { precioId: 'a', oculta: false }, { precioId: 'c', oculta: true }]),
    ['a', 'b'],
  )
  assert.equal(conjuntoEnDocumento([{ precioId: null, oculta: false }, { precioId: 'a', oculta: false }]), null)
  assert.equal(conjuntoEnDocumento([{ precioId: 'a', oculta: true }]), null)
  // Una oculta sin precio_id no impide saber lo que SÍ va en el documento.
  assert.deepEqual(conjuntoEnDocumento([{ precioId: null, oculta: true }, { precioId: 'a', oculta: false }]), ['a'])
})

test('igualdad de conjuntos: orden y mayúsculas no cuentan; null nunca es igual', () => {
  assert.equal(mismoConjunto(['a', 'B'], ['b', 'A']), true)
  assert.equal(mismoConjunto(['a'], ['a', 'b']), false)
  assert.equal(mismoConjunto(null, ['a']), false)
  assert.equal(mismoConjunto([], []), false)
})

test('reutilizar: mismo conjunto, vigente, ni retirado ni emitido; el más reciente', () => {
  const op = (ids: string[], ocultos: string[] = []) => [
    ...ids.map((precioId) => ({ precioId, oculta: false })),
    ...ocultos.map((precioId) => ({ precioId, oculta: true })),
  ]
  const cands = [
    { id: 'viejo', creadoAt: '2026-09-29T20:00:00Z', venceEl: '2026-10-14T00:00:00Z', opciones: op(['r1'], ['x', 'y']) },
    { id: 'nuevo', creadoAt: '2026-09-30T09:00:00Z', venceEl: '2026-10-14T00:00:00Z', opciones: op(['r1'], ['x']) },
    { id: 'retirado', creadoAt: '2026-09-30T09:30:00Z', venceEl: '2026-10-14T00:00:00Z', retiradoAt: AYER, opciones: op(['r1']) },
    { id: 'caducado', creadoAt: '2026-09-30T09:40:00Z', venceEl: AYER, opciones: op(['r1']) },
    { id: 'otro', creadoAt: '2026-09-30T09:50:00Z', venceEl: '2026-10-14T00:00:00Z', opciones: op(['r1', 'r2']) },
  ]
  assert.equal(elegirReutilizable(cands, ['r1'], HOY)?.id, 'nuevo')
  assert.equal(elegirReutilizable(cands, ['r1', 'r2'], HOY)?.id, 'otro')
  assert.equal(elegirReutilizable(cands, ['r3'], HOY), null)
  assert.equal(elegirReutilizable(cands, null, HOY), null)
  assert.equal(elegirReutilizable([{ ...cands[1], emitidoAt: AYER }], ['r1'], HOY), null)
})
