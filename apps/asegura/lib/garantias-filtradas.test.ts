import assert from 'node:assert/strict'
import { test } from 'node:test'

import { agregarGarantiasFiltradas } from './garantias-filtradas.ts'

const ev = (presupuestoId: string, garantias: string[]) => ({ presupuestoId, detalle: { garantias, comparadas: [] } })

test('cuenta PRESUPUESTOS distintos por garantía, no eventos', () => {
  const ramos = new Map([['p1', 'auto'], ['p2', 'auto'], ['p3', 'moto']])
  const r = agregarGarantiasFiltradas([
    ev('p1', ['lunas']), ev('p1', ['lunas']), ev('p1', ['lunas', 'robo']),
    ev('p2', ['robo']),
    ev('p3', ['equipamiento']),
  ], ramos)
  assert.equal(r.presupuestosConActividad, 3)
  assert.deepEqual(r.ramos.map((x) => [x.ramo, x.presupuestos]), [['auto', 2], ['moto', 1]])
  // Robo 2 (p1, p2) antes que Lunas 1 aunque Lunas tenga más eventos.
  assert.deepEqual(r.ramos[0].garantias.map((g) => [g.clave, g.presupuestos]), [['robo', 2], ['lunas', 1]])
})

test('a igualdad, el orden del catálogo; claves ajenas, ramos sin catálogo y detalles rotos se ignoran', () => {
  const ramos = new Map([['p1', 'auto'], ['p2', 'comunidad']])
  const r = agregarGarantiasFiltradas([
    ev('p1', ['robo', 'lunas', 'inventada']),
    ev('p2', ['lunas']),
    { presupuestoId: 'p1', detalle: 'basura' },
    ev('desconocido', ['lunas']),
  ], ramos)
  assert.equal(r.presupuestosConActividad, 1)
  assert.deepEqual(r.ramos[0].garantias.map((g) => g.clave), ['lunas', 'robo'])
})

test('sin actividad → sin ramos (la pantalla dice «aún no hay», no una tabla a cero)', () => {
  assert.deepEqual(agregarGarantiasFiltradas([], new Map()), { presupuestosConActividad: 0, ramos: [] })
})
