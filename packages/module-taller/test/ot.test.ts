import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ESTADOS_OT, TRANSICIONES_OT, transicionarOt, puedeTransicionar, esFinal, esEstadoOt } from '../src/index.ts'

const listo = { recepcionFirmada: true, presupuestoAceptado: true, partesAbiertos: 0, ampliacionesPendientes: 0, facturaEmitida: true }

test('camino feliz completo', () => {
  const camino = ['recepcion', 'presupuesto', 'aceptado', 'en_curso', 'ampliacion_pendiente', 'en_curso', 'terminado', 'facturado', 'entregado'] as const
  for (let i = 0; i + 1 < camino.length; i++) {
    const r = transicionarOt(camino[i], camino[i + 1], listo)
    assert.equal(r.ok, true, `${camino[i]} → ${camino[i + 1]}`)
  }
})

test('transiciones no permitidas', () => {
  assert.equal(puedeTransicionar('recepcion', 'en_curso'), false)
  assert.equal(puedeTransicionar('presupuesto', 'en_curso'), false)
  assert.equal(puedeTransicionar('facturado', 'en_curso'), false) // facturar es irreversible
  assert.equal(puedeTransicionar('en_curso', 'cancelada'), false)
  assert.equal(transicionarOt('terminado', 'entregado', listo).ok, false) // no se entrega sin facturar
})

test('estados finales y tabla cerrada', () => {
  assert.ok(esFinal('entregado'))
  assert.ok(esFinal('cancelada'))
  for (const e of ESTADOS_OT) for (const d of TRANSICIONES_OT[e]) assert.ok(esEstadoOt(d))
  assert.equal(esEstadoOt('abierta'), false)
})

test('guardias: sin el dato explícito NO se avanza (undefined ≠ true)', () => {
  assert.equal(transicionarOt('recepcion', 'presupuesto').ok, false)
  assert.equal(transicionarOt('presupuesto', 'aceptado', { presupuestoAceptado: false }).ok, false)
  assert.equal(transicionarOt('en_curso', 'terminado', { ampliacionesPendientes: 0 }).ok, false) // partes sin saber
  assert.equal(transicionarOt('en_curso', 'terminado', { ...listo, partesAbiertos: 1 }).ok, false)
  assert.equal(transicionarOt('en_curso', 'terminado', { ...listo, ampliacionesPendientes: 1 }).ok, false)
  assert.equal(transicionarOt('ampliacion_pendiente', 'en_curso', { ampliacionesPendientes: 1 }).ok, false)
  assert.equal(transicionarOt('terminado', 'facturado', { ...listo, recepcionFirmada: false }).ok, false)
  assert.equal(transicionarOt('terminado', 'facturado', { ...listo, facturaEmitida: undefined }).ok, false)
})

test('reapertura antes de facturar y cancelación antes de empezar', () => {
  assert.equal(transicionarOt('terminado', 'en_curso').ok, true)
  assert.equal(transicionarOt('aceptado', 'cancelada').ok, true)
})
