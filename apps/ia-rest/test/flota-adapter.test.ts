// Test del adaptador de flota (mapeo puro fila ia-rest → modelo @central/module-flota).
// Runner: node --test. El import de tipos de module-flota se borra en runtime, así que
// este test corre sin necesitar el symlink del workspace.

import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  vehiculoFromRow,
  porteFromRow,
  type VehiculoGrupoRow,
  type EventoTransporteRow,
} from '../src/lib/flota-adapter.ts'

test('vehiculoFromRow mapea columnas reales (incl. tarifa_fija_evento → tarifaFija)', () => {
  const row: VehiculoGrupoRow = {
    id: 'v1',
    cuenta_id: 'c1',
    nombre: 'Furgo frío',
    matricula: '1234-ABC',
    capacidad_kg: 1200,
    capacidad_m3: 9,
    tipo: 'frigorifico',
    es_propio: true,
    proveedor_transporte: null,
    tarifa_km: 0.5,
    tarifa_fija_evento: 30,
    activo: true,
  }
  assert.deepEqual(vehiculoFromRow(row), {
    id: 'v1',
    cuentaId: 'c1',
    nombre: 'Furgo frío',
    matricula: '1234-ABC',
    tipo: 'frigorifico',
    capacidadKg: 1200,
    capacidadM3: 9,
    esPropio: true,
    proveedorTransporte: null,
    tarifaKm: 0.5,
    tarifaFija: 30,
    activo: true,
  })
})

test('vehiculoFromRow aplica defaults seguros con nulls', () => {
  const row = {
    id: 'v2',
    cuenta_id: null,
    nombre: 'Sin datos',
    matricula: null,
    capacidad_kg: null,
    capacidad_m3: null,
    tipo: null,
    es_propio: null,
    proveedor_transporte: null,
    tarifa_km: null,
    tarifa_fija_evento: null,
    activo: null,
  } as VehiculoGrupoRow
  const v = vehiculoFromRow(row)
  assert.equal(v.tipo, 'furgon')
  assert.equal(v.esPropio, true)
  assert.equal(v.activo, true)
  assert.equal(v.cuentaId, '')
})

test('porteFromRow deriva estado (km reales → completado) y ancla al evento', () => {
  const row: EventoTransporteRow = {
    id: 'p1',
    evento_id: 'ev1',
    vehiculo_id: 'v1',
    conductor_id: 'c9',
    km_estimados: 100,
    km_reales: 120,
    coste_estimado: 70,
    coste_real: 80,
    hora_salida: '2026-07-01T08:00:00Z',
    hora_llegada: '2026-07-01T10:00:00Z',
  }
  const p = porteFromRow(row)
  assert.equal(p.estado, 'completado')
  assert.deepEqual(p.parent, { parentId: 'ev1', parentType: 'evento' })
  assert.equal(p.vehiculoId, 'v1')
  assert.equal(p.kmReales, 120)
})

test('porteFromRow sin km reales → planificado y sin parent si no hay evento', () => {
  const row: EventoTransporteRow = {
    id: 'p2',
    evento_id: null,
    vehiculo_id: 'v1',
    conductor_id: null,
    km_estimados: 50,
    km_reales: null,
    coste_estimado: null,
    coste_real: null,
    hora_salida: null,
    hora_llegada: null,
  }
  const p = porteFromRow(row)
  assert.equal(p.estado, 'planificado')
  assert.equal(p.parent, undefined)
})
