// Tests de clasificarDestino (a qué negocio pertenece cada movimiento). Runner: `node --test`
// (type-stripping). Reproduce el bug de la correduría: el banco rotula los ABONOS recibidos con
// el nombre del TITULAR como contraparte, así que NO se puede inferir "traspaso interno" por el
// nombre — las comisiones entrantes deben contar como ingreso de la correduría (seguros).
import { test } from 'node:test'
import assert from 'node:assert/strict'

import { clasificarDestino } from './destino.ts'

const TITULAR = 'ALBERTO SUAREZ GUTIERREZ'

test('ABONO de comisiones rotulado con el titular → seguros (no traspaso interno)', () => {
  // Liquidación de comisiones (BBVA pone el nombre del titular como contraparte).
  assert.equal(clasificarDestino('BBVA', 'TRANSFERENCIAS // TRANSFERENCIA RECIBIDA // LIQ.COMISIONES 202604', TITULAR, 302.06), 'seguros')
  assert.equal(clasificarDestino('BBVA', 'TRANSFERENCIAS // TRANSFERENCIA RECIBIDA // G.65792 LIQ.00050 GENERALI SE', TITULAR, 32.96), 'seguros')
  assert.equal(clasificarDestino('BBVA', 'TRANSFERENCIAS // TRANSFERENCIA RECIBIDA // -FRA-COMIS-20260331', `9000165676 ${TITULAR}`, 12.66), 'seguros')
})

test('ABONO con "LIQ. OP." en BBVA → turistico_duplex (cobro de Booking, no comisión)', () => {
  // Reconciliación 21/06/2026: las "TRANSFERENCIA RECIBIDA // LIQ. OP. Nº ..." de BBVA son
  // liquidaciones de reservas (Booking del dúplex), NO comisiones de la correduría (regla en destino.ts).
  assert.equal(clasificarDestino('BBVA', 'ABONO POR TRANSFERENCIA A SU FAVOR RECIBIDA EN EUROS // TRANSFERENCIA RECIBIDA // LIQ. OP. Nº 000492803640001', TITULAR, 856.77), 'turistico_duplex')
})

test('ABONO de pensión / nómina / Bizum personal rotulado con el titular → personal', () => {
  assert.equal(clasificarDestino('BBVA', 'PENSION // INGRESO POR NÓMINA O PENSIÓN // 28823484E', TITULAR, 905.52), 'personal')
  assert.equal(clasificarDestino('BBVA', 'BIZUM // OTROS // RECIBIDO: bodega 25', 'ALBERTO;SUAREZ;GUTIERREZ', 30.0), 'personal')
})

test('CARGO hacia una cuenta propia (titular como receptor) → traspaso interno', () => {
  assert.equal(clasificarDestino('BBVA', 'TRANSFERENCIAS // TRANSFERENCIA REALIZADA // ALBER', TITULAR, -76.75), 'traspaso_interno')
})

test('liquidación de tarjeta → traspaso interno (ambos signos)', () => {
  assert.equal(clasificarDestino('Kutxabank', 'TARJ.CRDTO 4662032019750300', '', -2482.47), 'traspaso_interno')
})

test('ingresos/gastos de pisos turísticos en Kutxa → turistico_pisos', () => {
  assert.equal(clasificarDestino('Kutxabank', 'ABONO BOOKING.COM', 'BOOKING.COM BV', 540.0), 'turistico_pisos')
  assert.equal(clasificarDestino('Kutxabank', 'PAGO STRIPE PAYMENTS', 'STRIPE', 120.0), 'turistico_pisos')
})

test('gasto propio del Dúplex en BBVA → turistico_duplex', () => {
  assert.equal(clasificarDestino('BBVA', 'RECIBO COMUNIDAD PASAJE FRANCISCO', 'COMUNIDAD DE PROPIETARIOS', -85.0), 'turistico_duplex')
})

test('CARGO de seguro (recibo Generali) → seguros', () => {
  assert.equal(clasificarDestino('Kutxabank', 'RECIBO GENERALI SEGUROS', 'GENERALI SEG. Y REASEG S.A.U.', -444.71), 'seguros')
})

test('ABONO BBVA "Transferencia recibida" a secas = Booking del Dúplex (no seguros)', () => {
  // BBVA no guarda el ordenante (Booking.com) al importar; el ingreso de reservas llega así.
  assert.equal(clasificarDestino('BBVA', 'Transferencia recibida', null, 439.64), 'turistico_duplex')
  assert.equal(clasificarDestino('BBVA', 'Transferencia recibida', null, 856.77), 'turistico_duplex')
})

test('ABONO BBVA con liquidación de agente (sin "comisión") → seguros', () => {
  assert.equal(clasificarDestino('BBVA', 'Pd005 saldo agente', null, 105.38), 'seguros')          // Caser
  assert.equal(clasificarDestino('BBVA', '2000071499 2remsaldo-27289 1.', null, 17.70), 'seguros') // Aegon
  assert.equal(clasificarDestino('BBVA', 'Liq. saldo cuenta asiento: 434671', null, 41.80), 'seguros') // AXA
  assert.equal(clasificarDestino('BBVA', 'Pago saldo cta. ag:41 3113599', null, 32.24), 'seguros') // Generali
  assert.equal(clasificarDestino('BBVA', 'Comisiones mayo       2026050', null, 76.30), 'seguros')
})

test('ABONO BBVA "Recibido: …" (Bizum de particular) → personal', () => {
  assert.equal(clasificarDestino('BBVA', 'Recibido: cerveza palacios', null, 20.0), 'personal')
  assert.equal(clasificarDestino('BBVA', 'Recibido: hato', null, 50.0), 'personal')
})
