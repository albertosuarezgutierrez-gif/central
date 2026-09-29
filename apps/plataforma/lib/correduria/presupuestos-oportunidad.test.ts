import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  estadoHitos, leerResumenPresupuestos, leerSinOportunidad, rutaSinOportunidad, textoPresupuestos, textoSinOportunidad,
} from './presupuestos-oportunidad.ts'

const hitos = { creadoAt: '2026-09-29T13:55:53Z', enviadoAt: null, vistoAt: null, aceptadoAt: null, emitidoAt: null, retiradoAt: null }

test('resumen: forma real de asegura (medida contra la BD el 29/09/2026)', () => {
  const r = leerResumenPresupuestos({ variantes: 5, mejorPrima: 106.77, mejorCompania: 'Allianz', presupuesto: hitos })
  assert.ok(r)
  assert.equal(textoPresupuestos(r), '5 presupuestos pedidos · mejor 106,77€ Allianz · al cliente: preparado, sin enviar')
  assert.equal(textoPresupuestos({ variantes: 0, mejorPrima: null, mejorCompania: null, presupuesto: null }), 'Aún no se ha pedido precio.')
  assert.equal(textoPresupuestos({ variantes: 2, mejorPrima: null, mejorCompania: null, presupuesto: null }), '2 presupuestos pedidos · sin precio real · no enviado al cliente')
})

test('resumen: sin el bloque (asegura vieja) es null, nunca «sin precio»', () => {
  assert.equal(leerResumenPresupuestos(undefined), null)
  assert.equal(leerResumenPresupuestos({ mejorPrima: 1 }), null)
})

test('hitos: gana el más avanzado', () => {
  assert.equal(estadoHitos({ ...hitos, enviadoAt: 'x', vistoAt: 'x' }), 'visto')
  assert.equal(estadoHitos({ ...hitos, enviadoAt: 'x', aceptadoAt: 'x', emitidoAt: 'x' }), 'emitido')
  assert.equal(estadoHitos({ ...hitos, enviadoAt: 'x', retiradoAt: 'x' }), 'retirado')
})

test('sin oportunidad: null ≠ [] y una fila rota invalida la lista', () => {
  assert.equal(leerSinOportunidad(undefined), null)
  assert.deepEqual(leerSinOportunidad([]), [])
  assert.equal(leerSinOportunidad([{ creadoAt: 'x' }]), null)
  const l = leerSinOportunidad([{ tarificacionId: 't1', creadoAt: '2026-09-10T07:44:59Z', ramo: 'auto', polizaId: 'p1', simulado: false, mejorPrima: 375.27, mejorCompania: 'Allianz', presupuesto: null }])
  assert.ok(l && l.length === 1)
  assert.equal(textoSinOportunidad(l[0]), 'retarificación de su póliza · mejor 375,27€ Allianz · no enviado al cliente')
  assert.match(textoSinOportunidad({ ...l[0], simulado: true, polizaId: null }), /^alta nueva · simulado/)
})

test('sin oportunidad: la retarificación abre SU póliza; el alta, la pantalla del ramo', () => {
  assert.equal(rutaSinOportunidad('c1', { ramo: 'auto', polizaId: 'p1' }), '/correduria/poliza/p1/retarificar')
  assert.equal(rutaSinOportunidad('c1', { ramo: 'moto', polizaId: null }), '/correduria/cliente/c1/moto-nuevo')
  assert.equal(rutaSinOportunidad('c1', { ramo: 'decesos', polizaId: null }), null)
})
