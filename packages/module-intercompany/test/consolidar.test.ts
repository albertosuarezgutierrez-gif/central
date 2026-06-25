// Tests de lógica pura del módulo de consolidación intercompany.
// Runner: node --test (Node 22, type-stripping nativo).

import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  round2,
  esIntercompany,
  operacionesInternas,
  totalIntercompany,
  consolidar,
} from '../src/consolidar.ts'
import type { OperacionIntercompany, ResumenSociedad } from '../src/types.ts'

// ── Escenario base: holding A (cocina), B (catering), C (tiendas) ─────────────

const SOCIEDADES: ResumenSociedad[] = [
  { sociedadId: 'A', ingresos: 1000, gastos: 400 },
  { sociedadId: 'B', ingresos: 2000, gastos: 1200 },
  { sociedadId: 'C', ingresos: 800, gastos: 600 },
]

function ops(): OperacionIntercompany[] {
  return [
    { id: 'op1', sociedadOrigenId: 'A', sociedadDestinoId: 'B', importe: 300 }, // interna
    { id: 'op2', sociedadOrigenId: 'A', sociedadDestinoId: 'C', importe: 200 }, // interna
    { id: 'op3', sociedadOrigenId: 'B', sociedadDestinoId: 'EXT', importe: 500 }, // cliente externo
    { id: 'op4', sociedadOrigenId: 'PROV', sociedadDestinoId: 'C', importe: 150 }, // proveedor externo
    { id: 'op5', sociedadOrigenId: 'A', sociedadDestinoId: 'A', importe: 50 }, // misma sociedad
  ]
}

const HOLDING = new Set(['A', 'B', 'C'])

test('round2 redondea a 2 decimales', () => {
  assert.equal(round2(1.005), 1.01)
})

test('esIntercompany: solo interna si ambos extremos están en el holding y son distintos', () => {
  assert.equal(esIntercompany({ id: '1', sociedadOrigenId: 'A', sociedadDestinoId: 'B', importe: 1 }, HOLDING), true)
  assert.equal(esIntercompany({ id: '2', sociedadOrigenId: 'B', sociedadDestinoId: 'EXT', importe: 1 }, HOLDING), false)
  assert.equal(esIntercompany({ id: '3', sociedadOrigenId: 'PROV', sociedadDestinoId: 'C', importe: 1 }, HOLDING), false)
  assert.equal(esIntercompany({ id: '4', sociedadOrigenId: 'A', sociedadDestinoId: 'A', importe: 1 }, HOLDING), false)
})

test('operacionesInternas y totalIntercompany aíslan lo interno', () => {
  const internas = operacionesInternas(ops(), HOLDING)
  assert.deepEqual(internas.map((o) => o.id), ['op1', 'op2'])
  assert.equal(totalIntercompany(ops(), HOLDING), 500)
})

test('consolidar: agregado bruto = suma simple', () => {
  const r = consolidar(SOCIEDADES, ops())
  assert.deepEqual(r.agregadoBruto, { ingresos: 3800, gastos: 2200, resultado: 1600 })
})

test('consolidar: elimina solo lo interno (500), deja el externo intacto', () => {
  const r = consolidar(SOCIEDADES, ops())
  assert.deepEqual(r.eliminaciones, { ingresos: 500, gastos: 500 })
  assert.deepEqual(r.consolidado, { ingresos: 3300, gastos: 1700, resultado: 1600 })
})

test('INVARIANTE: el resultado consolidado = el resultado bruto (eliminar no cambia el neto)', () => {
  const r = consolidar(SOCIEDADES, ops())
  assert.equal(r.consolidado.resultado, r.agregadoBruto.resultado)
})

test('consolidar: detalle intercompany por sociedad (origen=ingreso, destino=gasto)', () => {
  const r = consolidar(SOCIEDADES, ops())
  const a = r.porSociedad.find((s) => s.sociedadId === 'A')!
  const b = r.porSociedad.find((s) => s.sociedadId === 'B')!
  const c = r.porSociedad.find((s) => s.sociedadId === 'C')!
  assert.equal(a.ingresosIntercompany, 500) // A factura a B y a C
  assert.equal(a.gastosIntercompany, 0)
  assert.equal(b.ingresosIntercompany, 0) // op3 es a cliente externo → no cuenta
  assert.equal(b.gastosIntercompany, 300) // B compra a A (op1)
  assert.equal(c.ingresosIntercompany, 0)
  assert.equal(c.gastosIntercompany, 200) // C compra a A (op2); op4 es de proveedor externo → no cuenta
  assert.equal(a.resultado, 600)
})

test('consolidar sin operaciones: consolidado = bruto, sin eliminaciones', () => {
  const r = consolidar(SOCIEDADES)
  assert.deepEqual(r.eliminaciones, { ingresos: 0, gastos: 0 })
  assert.deepEqual(r.consolidado, r.agregadoBruto)
  assert.ok(r.porSociedad.every((s) => s.ingresosIntercompany === 0 && s.gastosIntercompany === 0))
})

test('consolidar: una operación a sociedad fuera del holding no se elimina', () => {
  const soc: ResumenSociedad[] = [{ sociedadId: 'A', ingresos: 100, gastos: 0 }]
  const r = consolidar(soc, [
    { id: 'x', sociedadOrigenId: 'A', sociedadDestinoId: 'FUERA', importe: 40 },
  ])
  assert.equal(r.eliminaciones.ingresos, 0)
  assert.deepEqual(r.consolidado, { ingresos: 100, gastos: 0, resultado: 100 })
})

test('consolidar: redondeo con decimales', () => {
  const soc: ResumenSociedad[] = [
    { sociedadId: 'A', ingresos: 100.1, gastos: 0 },
    { sociedadId: 'B', ingresos: 0, gastos: 50.05 },
  ]
  const r = consolidar(soc, [
    { id: 'x', sociedadOrigenId: 'A', sociedadDestinoId: 'B', importe: 10.005 },
  ])
  assert.equal(r.agregadoBruto.ingresos, 100.1)
  assert.equal(r.eliminaciones.ingresos, 10.01)
  assert.equal(r.consolidado.ingresos, 90.09)
})
