import test from 'node:test'
import assert from 'node:assert/strict'
import { MAX_DATOS_BORRADOR, marcaCreible, revisarBorradorEntrante, revisarSelectorBorrador } from './borrador-presupuesto-reglas.ts'

const C = 'AAAAAAAA-1111-4111-8111-111111111111'
const OP = '22222222-2222-4222-8222-222222222222'
const BUENO = { clienteId: C, oportunidadId: OP, ramo: 'auto', datos: { matricula: '1234ABC' }, guardadoEn: Date.UTC(2026, 9, 5), actor: 'alberto@x' }

test('un borrador bueno pasa, con ids en minúsculas y el actor recortado', () => {
  const r = revisarBorradorEntrante({ ...BUENO, actor: `  ${'a'.repeat(300)} ` })
  assert.ok(r.ok)
  if (!r.ok) return
  assert.equal(r.valor.clienteId, C.toLowerCase())
  assert.equal(r.valor.oportunidadId, OP)
  assert.equal(r.valor.actor.length, 200)
})

test('sin oportunidad (null, vacía o ausente) es «sin oportunidad», no un error', () => {
  for (const op of [null, '', undefined]) {
    const r = revisarBorradorEntrante({ ...BUENO, oportunidadId: op })
    assert.ok(r.ok && r.valor.oportunidadId === null)
  }
})

test('🪤 lo que no es un borrador no entra', () => {
  assert.equal(revisarBorradorEntrante(null).ok, false)
  assert.equal(revisarBorradorEntrante([]).ok, false)
  assert.equal(revisarBorradorEntrante({ ...BUENO, clienteId: 'nope' }).ok, false)
  assert.equal(revisarBorradorEntrante({ ...BUENO, oportunidadId: 'nope' }).ok, false)
  assert.equal(revisarBorradorEntrante({ ...BUENO, ramo: 'comunidades' }).ok, false)
  assert.equal(revisarBorradorEntrante({ ...BUENO, datos: 'texto' }).ok, false)
  assert.equal(revisarBorradorEntrante({ ...BUENO, datos: [1] }).ok, false)
  assert.equal(revisarBorradorEntrante({ ...BUENO, datos: { x: 'a'.repeat(MAX_DATOS_BORRADOR) } }).ok, false)
})

test('🪤 un sello de antes de 2026, decimal o no numérico es un reloj roto: no entra', () => {
  assert.equal(revisarBorradorEntrante({ ...BUENO, guardadoEn: 0 }).ok, false)
  assert.equal(revisarBorradorEntrante({ ...BUENO, guardadoEn: Date.UTC(2025, 11, 31) }).ok, false)
  assert.equal(revisarBorradorEntrante({ ...BUENO, guardadoEn: 1.5e12 + 0.5 }).ok, false)
  assert.equal(revisarBorradorEntrante({ ...BUENO, guardadoEn: '2026-10-05' }).ok, false)
  assert.equal(revisarBorradorEntrante({ ...BUENO, guardadoEn: Number.POSITIVE_INFINITY }).ok, false)
})

test('🪤 un sello del FUTURO se recorta a ahora (un reloj adelantado no gana siempre)', () => {
  const ahora = Date.UTC(2026, 9, 5, 10)
  assert.equal(marcaCreible(ahora + 3_600_000, ahora), ahora)
  assert.equal(marcaCreible(ahora - 5, ahora), ahora - 5)
})

test('selector de lectura/borrado', () => {
  assert.ok(revisarSelectorBorrador(C, 'auto').ok)
  const conOp = revisarSelectorBorrador(C, 'auto', OP)
  assert.ok(conOp.ok && conOp.valor.oportunidadId === OP)
  assert.equal(revisarSelectorBorrador('x', 'auto').ok, false)
  assert.equal(revisarSelectorBorrador(C, null).ok, false)
  assert.equal(revisarSelectorBorrador(C, 'auto', 'x').ok, false)
})
