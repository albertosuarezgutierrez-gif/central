import { test } from 'node:test'
import assert from 'node:assert/strict'
import { estadoComision, hayTarifasPendientes } from './canales-logica.ts'

test('comisión medida (bruto − neto > 0) se afirma con su importe', () => {
  assert.deepEqual(
    estadoComision({ portal: 'BOOKING', comision: 123.45, sinBruto: 0, tarifaPct: 19.72 }),
    { tipo: 'medida', importe: 123.45 },
  )
})

test('reservas sin bruto → «no consta», nunca 0€', () => {
  assert.deepEqual(
    estadoComision({ portal: 'BOOKING', comision: 0, sinBruto: 3, tarifaPct: 19.72 }),
    { tipo: 'sin_bruto', reservas: 3 },
  )
})

test('el 0 de un portal con tarifa «pendiente de confirmar» es un centinela, no una medición', () => {
  // Caso real 31/08/2026: EXPEDIA/AIRBNB/AGODA con commission_pct = 0 en portal_rates
  // («Pendiente confirmar con factura real») → neto = bruto → comisión 0 que NO significa 0€.
  assert.equal(estadoComision({ portal: 'EXPEDIA', comision: 0, sinBruto: 0, tarifaPct: 0 }).tipo, 'tarifa_pendiente')
  assert.equal(estadoComision({ portal: 'AIRBNB', comision: 0, sinBruto: 0, tarifaPct: 0 }).tipo, 'tarifa_pendiente')
  // Portal sin fila en portal_rates: mismo trato — no se sabe.
  assert.equal(estadoComision({ portal: 'NUEVO', comision: 0, sinBruto: 0, tarifaPct: null }).tipo, 'tarifa_pendiente')
})

test('DIRECTO sin comisión es afirmable: no hay intermediario', () => {
  assert.equal(estadoComision({ portal: 'DIRECTO', comision: 0, sinBruto: 0, tarifaPct: 0 }).tipo, 'sin_comision')
})

test('hayTarifasPendientes lista los portales cuyo ingreso va sin descontar comisión', () => {
  const canales = [
    { portal: 'BOOKING', comision: 100, sinBruto: 0, tarifaPct: 19.72 },
    { portal: 'EXPEDIA', comision: 0, sinBruto: 0, tarifaPct: 0 },
    { portal: 'DIRECTO', comision: 0, sinBruto: 0, tarifaPct: 0 },
  ]
  assert.deepEqual(hayTarifasPendientes(canales), ['EXPEDIA'])
})
