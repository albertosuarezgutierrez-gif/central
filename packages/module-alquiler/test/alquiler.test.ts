import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  diasAlquiler,
  importeLinea,
  subtotal,
  totalAlquiler,
  diasRetraso,
  recargoRetraso,
  solapa,
  comprometidoEnVentana,
  disponibleEnVentana,
  puedeTransicionar,
  transicionar,
  esIntercompany,
  totalIntercompany,
  operacionIntercompanyDe,
  resumenAlquileres,
} from '../src/alquiler.ts'
import type { Alquiler } from '../src/types.ts'

function base(over: Partial<Alquiler> = {}): Alquiler {
  return {
    id: 'a1',
    aTerceros: true,
    fechaInicio: '2026-07-01',
    fechaFin: '2026-07-03', // 3 días inclusivos
    estado: 'reservado',
    lineas: [{ materialId: 'm-silla', nombre: 'Silla Chiavari', cantidad: 100, tarifaDia: 1.5 }],
    ...over,
  }
}

test('diasAlquiler es inclusivo y mínimo 1', () => {
  assert.equal(diasAlquiler('2026-07-01', '2026-07-03'), 3)
  assert.equal(diasAlquiler('2026-07-01', '2026-07-01'), 1)
  assert.equal(diasAlquiler('2026-07-05', '2026-07-01'), 1) // fin antes de inicio → 1
})

test('importeLinea: por día vs tarifa fija', () => {
  assert.equal(importeLinea({ materialId: 'm', nombre: 'x', cantidad: 100, tarifaDia: 1.5 }, 3), 450)
  assert.equal(
    importeLinea({ materialId: 'm', nombre: 'x', cantidad: 10, tarifaDia: 1.5, tarifaFija: 2 }, 3),
    20, // fija manda: 2 × 10, ignora días
  )
})

test('subtotal y total con descuento (la fianza no suma)', () => {
  const a = base({ descuentoEur: 50, fianza: 200 })
  assert.equal(subtotal(a), 450) // 100 × 1.5 × 3
  assert.equal(totalAlquiler(a), 400) // 450 − 50
})

test('descuento no deja el total negativo', () => {
  assert.equal(totalAlquiler(base({ descuentoEur: 99999 })), 0)
})

test('recargo por retraso = días tarde × tarifa/día (fija no recarga)', () => {
  const a = base({ fechaDevolucionReal: '2026-07-05' }) // 2 días tarde sobre fin 07-03
  assert.equal(diasRetraso(a), 2)
  assert.equal(recargoRetraso(a), 300) // 100 × 1.5 × 2
  assert.equal(recargoRetraso(base()), 0) // sin devolución real
})

test('solape de ventanas de fechas', () => {
  assert.equal(solapa('2026-07-01', '2026-07-03', '2026-07-03', '2026-07-04'), true) // tocan en 07-03
  assert.equal(solapa('2026-07-01', '2026-07-03', '2026-07-04', '2026-07-05'), false)
})

test('comprometido y disponible por ventana (solo activos que solapan)', () => {
  const alquileres = [
    base({ id: 'a1', estado: 'entregado' }), // 100 sillas 07-01..07-03
    base({ id: 'a2', estado: 'reservado', fechaInicio: '2026-07-02', fechaFin: '2026-07-02', lineas: [{ materialId: 'm-silla', nombre: 'Silla', cantidad: 50, tarifaDia: 1.5 }] }),
    base({ id: 'a3', estado: 'cancelado', lineas: [{ materialId: 'm-silla', nombre: 'Silla', cantidad: 999, tarifaDia: 1.5 }] }), // cancelado → ignora
    base({ id: 'a4', estado: 'reservado', fechaInicio: '2026-08-01', fechaFin: '2026-08-02', lineas: [{ materialId: 'm-silla', nombre: 'Silla', cantidad: 30, tarifaDia: 1.5 }] }), // fuera de ventana
  ]
  assert.equal(comprometidoEnVentana(alquileres, 'm-silla', '2026-07-02', '2026-07-02'), 150)
  assert.equal(disponibleEnVentana(alquileres, 'm-silla', 200, '2026-07-02', '2026-07-02'), 50)
  assert.equal(disponibleEnVentana(alquileres, 'm-silla', 120, '2026-07-02', '2026-07-02'), 0) // nunca negativo
})

test('máquina de estados de fulfillment', () => {
  assert.equal(puedeTransicionar('reservado', 'entregado'), true)
  assert.equal(puedeTransicionar('entregado', 'devuelto'), true)
  assert.equal(puedeTransicionar('devuelto', 'entregado'), false)
  assert.equal(transicionar(base(), 'entregado').estado, 'entregado')
  assert.throws(() => transicionar(base({ estado: 'devuelto' }), 'entregado'))
})

test('intercompany: solo interno entre sociedades distintas', () => {
  const interno = base({ id: 'i1', aTerceros: false, sociedadOrigenId: 's-materiales', sociedadDestinoId: 's-catering' })
  const tercero = base({ id: 't1', aTerceros: true, sociedadOrigenId: 's-materiales', sociedadDestinoId: 's-catering' })
  assert.equal(esIntercompany(interno), true)
  assert.equal(esIntercompany(tercero), false) // a terceros nunca es intercompany
  assert.equal(esIntercompany(base({ aTerceros: false, sociedadOrigenId: 's', sociedadDestinoId: 's' })), false) // misma sociedad
  assert.equal(totalIntercompany([interno, tercero]), 450)
  const op = operacionIntercompanyDe(interno)!
  assert.equal(op.sociedadOrigenId, 's-materiales')
  assert.equal(op.importe, 450)
  assert.deepEqual(op.parent, { parentId: 'i1', parentType: 'alquiler' })
  assert.equal(operacionIntercompanyDe(tercero), null)
})

test('resumen agrega por estado, ingresos terceros vs interno y fianzas', () => {
  const r = resumenAlquileres([
    base({ id: 'a1', estado: 'entregado', aTerceros: true, fianza: 200 }), // total 450 terceros
    base({ id: 'a2', estado: 'reservado', aTerceros: false, sociedadOrigenId: 'x', sociedadDestinoId: 'y' }), // 450 interno
    base({ id: 'a3', estado: 'cancelado', aTerceros: true }), // no cuenta
  ])
  assert.equal(r.porEstado.entregado, 1)
  assert.equal(r.activos, 2)
  assert.equal(r.ingresosTerceros, 450)
  assert.equal(r.totalInterno, 450)
  assert.equal(r.fianzasRetenidas, 200) // solo el entregado
})
