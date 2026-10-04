import test from 'node:test'
import assert from 'node:assert/strict'
import {
  ahorroFrenteActual, esCanalFinanciera, esMismaCompaniaQueLaActual, objetivoPrioritario, periodoEnAnios, periodoEnMeses, primaActualAnualizada,
} from './competencia-poliza.ts'
import { estadoAvisoVencimiento } from './oportunidad-aviso.ts'
import { seguroAnteriorDe } from './oportunidad-seguimiento.ts'

test('canal financiera: lista única, sin acentos, por «contiene»; sin canal = no se sabe', () => {
  assert.equal(esCanalFinanciera('RCI BANQUE S.A. SUCURSAL EN ESPAÑA'), true)
  assert.equal(esCanalFinanciera('Mobilize Financial Services'), true)
  assert.equal(esCanalFinanciera('Santander Consumer Finance'), true)
  assert.equal(esCanalFinanciera('Oficina 1234 Sevilla'), false)
  assert.equal(esCanalFinanciera(null), null)
  assert.equal(esCanalFinanciera('   '), null)
})

test('objetivo prioritario: financiera, cesión o plurianual de pago único', () => {
  assert.equal(objetivoPrioritario({ canal: 'RCI BANQUE' }).prioritario, true)
  assert.deepEqual(objetivoPrioritario({ canal: 'RCI BANQUE' }).motivos, ['financiera'])
  assert.equal(objetivoPrioritario({ cesionDerechos: true }).prioritario, true)
  assert.equal(objetivoPrioritario({ pagoUnico: true, periodoMeses: 36 }).prioritario, true)
  assert.equal(objetivoPrioritario({ pagoUnico: true }).prioritario, true, 'pago único sin periodo conocido: sigue marcada')
  assert.match(objetivoPrioritario({ canal: 'Mobilize', pagoUnico: true, periodoMeses: 36 }).texto ?? '', /financiera.*plurianual/)
})

test('objetivo prioritario: un pago único de 12 meses no es plurianual', () => {
  assert.equal(objetivoPrioritario({ pagoUnico: true, periodoMeses: 12, canal: 'Agente', cesionDerechos: false }).prioritario, false)
})

test('objetivo prioritario: tres estados (false solo si TODO consta; si no, null, nunca «no»)', () => {
  assert.equal(objetivoPrioritario({ canal: 'Agente López', cesionDerechos: false, pagoUnico: false }).prioritario, false)
  assert.equal(objetivoPrioritario({ canal: 'Agente López' }).prioritario, null)
  assert.equal(objetivoPrioritario({}).prioritario, null)
  assert.equal(objetivoPrioritario({}).texto, null)
})

test('periodo: años y meses solo con las dos fechas legibles', () => {
  assert.equal(periodoEnMeses('2024-03-05', '2027-03-04'), 36)
  assert.equal(periodoEnAnios('2024-03-05', null), null)
  assert.equal(periodoEnAnios('2027-03-04', '2024-03-05'), null, 'vencimiento anterior al efecto')
  assert.equal(periodoEnAnios('2000-01-01', '2026-01-01'), null, 'más de 10 años = fecha mal leída')
  assert.equal(periodoEnAnios('2026-02-30', '2027-01-01'), null)
})

test('prima anualizada: plurianual de pago único con periodo conocido → prima / años', () => {
  const r = primaActualAnualizada({ prima: 900, pagoUnico: true, fechaEfecto: '2024-03-05', fechaVencimiento: '2027-03-04' })
  assert.deepEqual(r, { anual: 300, origen: 'anualizada', anios: 3 })
})

test('prima anualizada: pago único SIN periodo conocido → null (no se inventa el ahorro)', () => {
  assert.deepEqual(primaActualAnualizada({ prima: 900, pagoUnico: true, fechaEfecto: '2024-03-05' }), { anual: null, motivo: 'periodo_desconocido' })
  assert.deepEqual(primaActualAnualizada({ prima: 900, pagoUnico: true }), { anual: null, motivo: 'periodo_desconocido' })
})

test('prima anualizada: pago único de un año = la prima; anual declarada = la prima', () => {
  assert.equal(primaActualAnualizada({ prima: 400, pagoUnico: true, fechaEfecto: '2025-10-01', fechaVencimiento: '2026-10-01' }).anual, 400)
  assert.equal(primaActualAnualizada({ prima: 400, pagoUnico: false, fechaEfecto: '2024-01-01', fechaVencimiento: '2027-01-01' }).anual, 400)
})

test('prima anualizada: pago desconocido y periodo de varios años → null; sin fechas, la prima es anual', () => {
  assert.deepEqual(primaActualAnualizada({ prima: 900, fechaEfecto: '2024-03-05', fechaVencimiento: '2027-03-04' }), { anual: null, motivo: 'posible_plurianual' })
  assert.equal(primaActualAnualizada({ prima: 400 }).anual, 400)
})

test('prima anualizada: sin prima (null, 0, negativa) es null, nunca 0', () => {
  for (const prima of [null, undefined, 0, -5]) assert.deepEqual(primaActualAnualizada({ prima }), { anual: null, motivo: 'prima_desconocida' })
})

test('ahorro: solo con las dos cifras; negativo si la propuesta es más cara', () => {
  assert.deepEqual(ahorroFrenteActual(300, 240), { actual: 300, propuesta: 240, ahorro: 60, pct: 20 })
  assert.equal(ahorroFrenteActual(300, 330)?.ahorro, -30)
  assert.equal(ahorroFrenteActual(null, 240), null)
  assert.equal(ahorroFrenteActual(300, null), null)
  assert.equal(ahorroFrenteActual(0, 240), null)
})

test('misma compañía que la actual: no se vende «ahorro» a quien se queda', () => {
  assert.equal(esMismaCompaniaQueLaActual('Mapfre España', 'MAPFRE'), true)
  assert.equal(esMismaCompaniaQueLaActual('Mapfre', 'Allianz'), false)
  assert.equal(esMismaCompaniaQueLaActual(null, 'Allianz'), null)
})

test('aviso de vencimiento: sin fecha NO se avisa y se dice «vencimiento desconocido»', () => {
  const r = estadoAvisoVencimiento(null, '2026-10-03')
  assert.equal(r.estado, 'desconocido')
  assert.match(r.texto, /Vencimiento desconocido/)
  assert.equal(estadoAvisoVencimiento('2026-13-45', '2026-10-03').estado, 'desconocido')
})

test('aviso de vencimiento: 45 días antes; dentro de la ventana, ya toca', () => {
  const lejos = estadoAvisoVencimiento('2026-12-31', '2026-10-03')
  assert.equal(lejos.estado, 'programado')
  assert.equal(lejos.estado === 'programado' && lejos.fechaAviso, '2026-11-16')
  const cerca = estadoAvisoVencimiento('2026-11-10', '2026-10-03')
  assert.equal(cerca.estado, 'en_ventana')
  assert.equal(cerca.estado === 'en_ventana' && cerca.dias, 38)
})

test('SeguroAnterior: pagoUnico y fechaVencimiento viajan solo si se saben; false es un dato', () => {
  const a = seguroAnteriorDe({ codigoDgs: 'C0058', pagoUnico: false, fechaVencimiento: '2027-03-04', numeroPoliza: 'ABC123' })
  assert.equal(a?.pagoUnico, false)
  assert.equal(a?.fechaVencimiento, '2027-03-04')
  const b = seguroAnteriorDe({ codigoDgs: 'C0058', pagoUnico: 'si', fechaVencimiento: '2027-02-30' })
  assert.equal('pagoUnico' in (b ?? {}), false)
  assert.equal('fechaVencimiento' in (b ?? {}), false)
  assert.equal(seguroAnteriorDe({ pagoUnico: null }), null)
})
