// Tests de lógica pura del agregado Encargo.
// Runner: node --test (Node 22, type-stripping nativo).

import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  ESTADOS,
  esAbierto,
  esCerrado,
  puedeTransicionar,
  transicionar,
  componentesVinculados,
  estaCompleto,
  componentesFaltantes,
  resumenEncargos,
} from '../src/encargo.ts'
import type { Encargo, EstadoEncargo } from '../src/types.ts'

function enc(over: Partial<Encargo> = {}): Encargo {
  return {
    id: 'e1',
    tipo: 'evento',
    vertical: 'ia-rest',
    estado: 'borrador',
    createdAt: '2026-06-10T00:00:00Z',
    ...over,
  }
}

test('esAbierto / esCerrado', () => {
  assert.equal(esAbierto(enc({ estado: 'confirmado' })), true)
  assert.equal(esAbierto(enc({ estado: 'completado' })), false)
  assert.equal(esCerrado(enc({ estado: 'cancelado' })), true)
  assert.equal(esCerrado(enc({ estado: 'en_curso' })), false)
})

test('puedeTransicionar respeta la máquina de estados', () => {
  assert.equal(puedeTransicionar('borrador', 'confirmado'), true)
  assert.equal(puedeTransicionar('confirmado', 'en_curso'), true)
  assert.equal(puedeTransicionar('en_curso', 'completado'), true)
  assert.equal(puedeTransicionar('borrador', 'completado'), false) // no se salta a completado
  assert.equal(puedeTransicionar('completado', 'en_curso'), false) // terminal
  assert.equal(puedeTransicionar('cancelado', 'borrador'), false) // terminal
})

test('cualquier estado abierto puede cancelarse', () => {
  for (const e of ['borrador', 'presupuestado', 'confirmado', 'en_curso'] as EstadoEncargo[]) {
    assert.equal(puedeTransicionar(e, 'cancelado'), true)
  }
})

test('transicionar devuelve copia con nuevo estado y no muta el original', () => {
  const original = enc({ estado: 'confirmado' })
  const siguiente = transicionar(original, 'en_curso', '2026-06-20T10:00:00Z')
  assert.equal(siguiente.estado, 'en_curso')
  assert.equal(siguiente.updatedAt, '2026-06-20T10:00:00Z')
  assert.equal(original.estado, 'confirmado') // intacto
})

test('transicionar lanza si la transición es inválida', () => {
  assert.throws(() => transicionar(enc({ estado: 'borrador' }), 'completado'), /Transición inválida/)
})

test('componentesVinculados detecta solo los enlaces presentes y no vacíos', () => {
  const e = enc({
    enlaces: {
      oportunidadId: 'op1',
      presupuestoId: 'pr1',
      asignacionesActivo: [],
      proveedores: ['s1'],
      porteIds: ['p1', 'p2'],
    },
  })
  assert.deepEqual(componentesVinculados(e), ['oportunidad', 'presupuesto', 'proveedores', 'portes'])
})

test('componentesVinculados vacío si no hay enlaces', () => {
  assert.deepEqual(componentesVinculados(enc()), [])
})

test('estaCompleto y componentesFaltantes', () => {
  const e = enc({ enlaces: { oportunidadId: 'op1', presupuestoId: 'pr1' } })
  assert.equal(estaCompleto(e, ['oportunidad', 'presupuesto']), true)
  assert.equal(estaCompleto(e, ['oportunidad', 'presupuesto', 'feedback']), false)
  assert.deepEqual(componentesFaltantes(e, ['oportunidad', 'presupuesto', 'feedback']), ['feedback'])
})

test('resumenEncargos agrega por estado, por tipo, abiertos, valor y completados del mes', () => {
  const ref = new Date('2026-06-15T00:00:00Z')
  const encargos: Encargo[] = [
    enc({ id: '1', estado: 'confirmado', tipo: 'evento', importeTotal: 1000 }),
    enc({ id: '2', estado: 'en_curso', tipo: 'porte', importeTotal: 200 }),
    enc({ id: '3', estado: 'completado', tipo: 'evento', updatedAt: '2026-06-05T00:00:00Z' }), // mes ref
    enc({ id: '4', estado: 'completado', tipo: 'alquiler', updatedAt: '2026-05-20T00:00:00Z' }), // otro mes
    enc({ id: '5', estado: 'cancelado', tipo: 'evento' }),
  ]
  const r = resumenEncargos(encargos, ref)
  assert.equal(r.porEstado.confirmado, 1)
  assert.equal(r.porEstado.en_curso, 1)
  assert.equal(r.porEstado.completado, 2)
  assert.equal(r.porEstado.cancelado, 1)
  assert.equal(r.porTipo.evento, 3)
  assert.equal(r.porTipo.porte, 1)
  assert.equal(r.porTipo.alquiler, 1)
  assert.equal(r.abiertos, 2) // confirmado + en_curso
  assert.equal(r.valorAbierto, 1200) // 1000 + 200
  assert.equal(r.completadosMes, 1) // solo el de junio
})

test('ESTADOS expone los 6 estados', () => {
  assert.equal(ESTADOS.length, 6)
})
