import { test } from 'node:test'
import assert from 'node:assert/strict'
import { validarPuntoControl, evaluarSalida, objetivoControl } from '../src/appcc.ts'
import type { ElaboracionTraza, PuntoControl } from '../src/types.ts'

function elab(over: Partial<ElaboracionTraza> = {}): ElaboracionTraza {
  return {
    id: 'e', nombre: 'Plato', ubicaciones: [], ingredientes: [], controles: [],
    ...over,
  }
}

test('control térmico: conforme solo si > 70 °C', () => {
  assert.equal(validarPuntoControl({ tipo: 'termico', valor: 72 }).conforme, true)
  assert.equal(validarPuntoControl({ tipo: 'termico', valor: 70 }).conforme, false)
  assert.equal(validarPuntoControl({ tipo: 'termico', valor: 65 }).conforme, false)
})

test('control sin valor → no registrado y no conforme', () => {
  const r = validarPuntoControl({ tipo: 'termico' })
  assert.equal(r.registrado, false)
  assert.equal(r.conforme, false)
  assert.match(r.motivo!, /sin registrar/)
})

test('congelación conforme si ≤ −18 °C', () => {
  assert.equal(validarPuntoControl({ tipo: 'congelacion', valor: -18 }).conforme, true)
  assert.equal(validarPuntoControl({ tipo: 'congelacion', valor: -10 }).conforme, false)
})

test('abatimiento: necesita temp ≤ 10 Y tiempo < 120 min', () => {
  assert.equal(validarPuntoControl({ tipo: 'abatimiento', valor: 8, minutos: 90 }).conforme, true)
  assert.equal(validarPuntoControl({ tipo: 'abatimiento', valor: 8, minutos: 130 }).conforme, false)
  assert.equal(validarPuntoControl({ tipo: 'abatimiento', valor: 12, minutos: 90 }).conforme, false)
  // sin minutos: solo se exige la temperatura
  assert.equal(validarPuntoControl({ tipo: 'abatimiento', valor: 8 }).conforme, true)
})

test('refrigeración conforme si ≤ 4 °C', () => {
  assert.equal(validarPuntoControl({ tipo: 'refrigeracion', valor: 4 }).conforme, true)
  assert.equal(validarPuntoControl({ tipo: 'refrigeracion', valor: 6 }).conforme, false)
})

test('objetivoControl devuelve texto legible por tipo', () => {
  assert.match(objetivoControl('termico'), /70/)
  assert.match(objetivoControl('congelacion'), /18/)
})

test('evaluarSalida: apta solo con todo en regla', () => {
  const ctrl: PuntoControl = { tipo: 'termico', valor: 75 }
  const apta = evaluarSalida(elab({
    controles: [ctrl], muestra_testigo: true, firma: 'Carmen',
  }))
  assert.equal(apta.apta, true)
})

test('evaluarSalida: bloquea si falta registrar un control', () => {
  const v = evaluarSalida(elab({
    controles: [{ tipo: 'termico' }], muestra_testigo: true, firma: 'Carmen',
  }))
  assert.equal(v.apta, false)
  assert.deepEqual(v.faltan_controles, ['termico'])
})

test('evaluarSalida: bloquea si control fuera de rango', () => {
  const v = evaluarSalida(elab({
    controles: [{ tipo: 'termico', valor: 50 }], muestra_testigo: true, firma: 'Carmen',
  }))
  assert.equal(v.apta, false)
  assert.deepEqual(v.no_conformes, ['termico'])
})

test('evaluarSalida: bloquea sin muestra testigo y sin firma', () => {
  const v = evaluarSalida(elab({ controles: [{ tipo: 'termico', valor: 75 }] }))
  assert.equal(v.apta, false)
  assert.equal(v.sin_muestra_testigo, true)
  assert.equal(v.sin_firma, true)
})
