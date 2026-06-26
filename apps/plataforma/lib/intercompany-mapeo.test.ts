// Tests de los helpers PUROS de la capa intercompany. Runner: `node --test` (type-stripping).
// La lógica de consolidación (eliminación) se prueba en el módulo `@central/module-intercompany`;
// aquí solo el mapeo BD↔dominio y la agregación negocio→sociedad propios de plataforma.
import { test } from 'node:test'
import assert from 'node:assert/strict'

import { filaAOperacion, resumenPorSociedad, type OperacionIntercompanyRow } from './intercompany-mapeo.ts'

test('filaAOperacion mapea snake_case → camelCase y normaliza importe/fecha', () => {
  const row: OperacionIntercompanyRow = {
    id: 'op1',
    sociedad_origen_id: 'flota',
    sociedad_destino_id: 'catering',
    importe: '1234.50',
    concepto: 'Porte evento',
    fecha: new Date('2026-03-15T10:00:00Z'),
    tipo: 'flota',
    parent_id: 'porte-9',
    parent_type: 'porte',
  }
  const op = filaAOperacion(row)
  assert.equal(op.sociedadOrigenId, 'flota')
  assert.equal(op.sociedadDestinoId, 'catering')
  assert.equal(op.importe, 1234.5)
  assert.equal(op.fecha, '2026-03-15')
  assert.deepEqual(op.parent, { parentId: 'porte-9', parentType: 'porte' })
})

test('filaAOperacion sin parent → parent undefined; fecha string se conserva', () => {
  const op = filaAOperacion({
    id: 'op2', sociedad_origen_id: 'a', sociedad_destino_id: 'b', importe: 10,
    concepto: null, fecha: '2026-01-02', tipo: null, parent_id: null, parent_type: null,
  })
  assert.equal(op.parent, undefined)
  assert.equal(op.fecha, '2026-01-02')
})

test('resumenPorSociedad agrega varios negocios bajo la misma sociedad', () => {
  const r = resumenPorSociedad([
    { sociedadId: 's1', ingresos: 100, gastos: 40, disponible: true },
    { sociedadId: 's1', ingresos: 50, gastos: 10, disponible: true }, // 2º negocio del mismo CIF
    { sociedadId: 's2', ingresos: 200, gastos: 90, disponible: true },
  ])
  const s1 = r.find(x => x.sociedadId === 's1')!
  assert.equal(s1.ingresos, 150)
  assert.equal(s1.gastos, 50)
  assert.equal(r.length, 2)
})

test('resumenPorSociedad ignora negocios no disponibles', () => {
  const r = resumenPorSociedad([
    { sociedadId: 's1', ingresos: 100, gastos: 40, disponible: true },
    { sociedadId: 's1', ingresos: 999, gastos: 999, disponible: false }, // se ignora
  ])
  assert.equal(r.length, 1)
  assert.equal(r[0].ingresos, 100)
  assert.equal(r[0].gastos, 40)
})
