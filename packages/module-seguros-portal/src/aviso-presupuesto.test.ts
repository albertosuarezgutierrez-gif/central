// La campana de la RENOVACIÓN CON ALTERNATIVAS publicada en la app (04/11/2026).
import { test } from 'node:test'
import assert from 'node:assert/strict'

import { avisosDe, esClaveDescartable, HREF_POR_TIPO, type EntradaAvisos } from './avisos.ts'

const HOY = new Date('2026-11-04T10:00:00Z')
const base: EntradaAvisos = { autorizaciones: { otorgadas: [], recibidas: [] }, obligaciones: [], peticiones: [], datos: [], carnets: [], firmas: [], hoy: HOY }
const ID = '33333333-3333-4333-8333-333333333333'

test('una renovación publicada sale en la campana y lleva a SU presupuesto', () => {
  const r = avisosDe({ ...base, presupuestos: [{ id: ID, ramo: 'hogar' }] })
  const a = r.avisos.find((x) => x.tipo === 'presupuesto_disponible')
  assert.ok(a)
  assert.equal(a.href, `/boveda/presupuesto/${ID}`)
  assert.match(a.titulo, /renovación de hogar/)
  assert.match(a.detalle, /elegir no contrata nada/)
  assert.doesNotMatch(`${a.titulo} ${a.detalle}`, /€|\d+,\d{2}/, 'sin importes en la campana')
})

test('no se descarta al pulsarla: se va sola cuando elige (pide algo)', () => {
  const r = avisosDe({ ...base, presupuestos: [{ id: ID, ramo: null }], leidos: new Set([`presupuesto_disponible:${ID}`]) })
  assert.equal(r.avisos.filter((x) => x.tipo === 'presupuesto_disponible').length, 1)
  assert.equal(r.avisos[0].descartable, false)
  assert.equal(esClaveDescartable(`presupuesto_disponible:${ID}`), false)
  assert.ok(HREF_POR_TIPO.presupuesto_disponible)
})

test('null = no se ha podido leer (cuenta como fuente ilegible); ausente = esta superficie no lo mira', () => {
  assert.ok(avisosDe({ ...base, presupuestos: null }).fuentesIlegibles.includes('presupuestos'))
  const sin = avisosDe(base)
  assert.equal(sin.fuentesIlegibles.includes('presupuestos'), false)
  assert.equal(sin.avisos.some((x) => x.tipo === 'presupuesto_disponible'), false)
})
