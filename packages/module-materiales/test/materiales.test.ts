// Tests de lógica pura del módulo de materiales.
// Runner: node --test (Node 22, type-stripping nativo).

import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  round2,
  disponibilidadTrasReserva,
  disponibilidadTrasDevolucion,
  costeDanos,
  valorStock,
  resumenStock,
  gastoCompras,
  resumenContable,
  puedeTransferir,
  alertasStockMinimo,
} from '../src/stock.ts'
import type { Material, AsignacionMaterial } from '../src/types.ts'

// ── Helpers ──────────────────────────────────────────────────────────────────

function mat(over: Partial<Material> = {}): Material {
  return {
    id: '1',
    negocioId: 'n1',
    nombre: 'Sofá',
    categoria: 'mobiliario',
    tipo: 'activo',
    estado: 'operativo',
    cantidadTotal: 10,
    cantidadDisponible: 8,
    precioCompra: 300,
    costeReposicion: 350,
    activo: true,
    ...over,
  }
}

function asig(over: Partial<AsignacionMaterial> = {}): AsignacionMaterial {
  return {
    id: 'a1',
    materialId: '1',
    cantidadReservada: 2,
    estado: 'entregado',
    ...over,
  }
}

// ── round2 ───────────────────────────────────────────────────────────────────

test('round2: redondea a 2 decimales', () => {
  assert.equal(round2(1.005), 1.01)
  assert.equal(round2(1.004), 1)
  assert.equal(round2(0), 0)
})

// ── disponibilidad ────────────────────────────────────────────────────────────

test('disponibilidadTrasReserva: no baja de 0', () => {
  assert.equal(disponibilidadTrasReserva(2, 5), 0)
  assert.equal(disponibilidadTrasReserva(8, 3), 5)
})

test('disponibilidadTrasDevolucion: no supera el total', () => {
  assert.equal(disponibilidadTrasDevolucion(8, 10, 5), 10)
  assert.equal(disponibilidadTrasDevolucion(5, 10, 3), 8)
})

// ── costeDanos ────────────────────────────────────────────────────────────────

test('costeDanos: cantidad × costeReposicion redondeado', () => {
  assert.equal(costeDanos(2, 350), 700)
  assert.equal(costeDanos(1, 12.333), 12.33)
})

// ── valorStock ────────────────────────────────────────────────────────────────

test('valorStock: suma cantidadTotal × costeReposicion', () => {
  const mats = [mat({ cantidadTotal: 2, costeReposicion: 100 }), mat({ cantidadTotal: 3, costeReposicion: 50 })]
  assert.equal(valorStock(mats), 350)
})

test('valorStock: lista vacía = 0', () => {
  assert.equal(valorStock([]), 0)
})

// ── resumenStock ──────────────────────────────────────────────────────────────

test('resumenStock: agrega correctamente', () => {
  const mats = [
    mat({ cantidadTotal: 10, cantidadDisponible: 8, costeReposicion: 100 }),
    mat({ id: '2', cantidadTotal: 5, cantidadDisponible: 5, costeReposicion: 200 }),
  ]
  const r = resumenStock(mats)
  assert.equal(r.materiales, 2)
  assert.equal(r.unidadesTotales, 15)
  assert.equal(r.unidadesDisponibles, 13)
  assert.equal(r.unidadesComprometidas, 2)
  assert.equal(r.valorTotal, 2000)
})

// ── gastoCompras ──────────────────────────────────────────────────────────────

test('gastoCompras: suma cantidadTotal × precioCompra', () => {
  const mats = [
    mat({ cantidadTotal: 2, precioCompra: 300 }),
    mat({ id: '2', cantidadTotal: 5, precioCompra: 10 }),
  ]
  assert.equal(gastoCompras(mats), 650)
})

test('gastoCompras: lista vacía = 0', () => {
  assert.equal(gastoCompras([]), 0)
})

// ── resumenContable ───────────────────────────────────────────────────────────

test('resumenContable: acumula compras + roturas correctamente', () => {
  const mats = [
    mat({ tipo: 'activo', cantidadTotal: 2, precioCompra: 300, costeReposicion: 350, cantidadDisponible: 2 }),
    mat({ id: '2', tipo: 'consumible', cantidadTotal: 5, precioCompra: 10, costeReposicion: 12, cantidadDisponible: 3 }),
  ]
  const asigs = [
    asig({ costeDanos: 700 }),
    asig({ id: 'a2', materialId: '2', costeDanos: null }),
  ]
  const r = resumenContable(mats, asigs)
  assert.equal(r.gastoCompras, 650)
  assert.equal(r.gastoRoturas, 700)
  assert.equal(r.valorInventario, round2(2 * 350 + 3 * 12))
  assert.equal(r.totalMateriales, 2)
  assert.equal(r.totalActivos, 1)
  assert.equal(r.totalConsumibles, 1)
})

// ── puedeTransferir ───────────────────────────────────────────────────────────

test('puedeTransferir: true si hay disponibles y estado ok', () => {
  assert.equal(puedeTransferir(mat({ cantidadDisponible: 3, estado: 'operativo' }), 2), true)
  assert.equal(puedeTransferir(mat({ cantidadDisponible: 3, estado: 'deteriorado' }), 3), true)
})

test('puedeTransferir: false si no hay suficientes', () => {
  assert.equal(puedeTransferir(mat({ cantidadDisponible: 1 }), 2), false)
})

test('puedeTransferir: false si estado en_reparacion o baja', () => {
  assert.equal(puedeTransferir(mat({ cantidadDisponible: 5, estado: 'en_reparacion' }), 1), false)
  assert.equal(puedeTransferir(mat({ cantidadDisponible: 5, estado: 'baja' }), 1), false)
})

test('puedeTransferir: false si no activo', () => {
  assert.equal(puedeTransferir(mat({ cantidadDisponible: 5, activo: false }), 1), false)
})

// ── alertasStockMinimo ────────────────────────────────────────────────────────

test('alertasStockMinimo: solo los que están por debajo del mínimo', () => {
  const mats = [
    mat({ id: '1', cantidadDisponible: 2, stockMinimo: 5 }),
    mat({ id: '2', cantidadDisponible: 10, stockMinimo: 5 }),
    mat({ id: '3', cantidadDisponible: 5, stockMinimo: 5 }),
    mat({ id: '4', cantidadDisponible: 1, stockMinimo: null }),
  ]
  const alertas = alertasStockMinimo(mats)
  assert.equal(alertas.length, 1)
  assert.equal(alertas[0].id, '1')
})
