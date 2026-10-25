// Infraseguro: umbral de module-tarificacion, `null` → sin_dato, y la propiedad horizontal no inventa alarmas.
import { test } from 'node:test'
import assert from 'node:assert/strict'

import { UMBRAL_INFRASEGURO, alertaInfraseguro, type EntradaInfraseguro } from './infraseguro.ts'

const e = (p: Partial<EntradaInfraseguro> = {}): EntradaInfraseguro => ({
  capitalContinente: 10_000_000, valorEstimado: 10_000_000, enComunidad: false, polizaComunidadEnlazada: false, ...p,
})

test('el umbral del portal es 0,9 (capital < estimación × 0,9)', () => {
  assert.equal(UMBRAL_INFRASEGURO, 0.9)
})

test('capital ≥ 90 % del valor → ok con ratio', () => {
  assert.deepEqual(alertaInfraseguro(e()), { estado: 'ok', ratio: 1 })
  assert.deepEqual(alertaInfraseguro(e({ capitalContinente: 9_000_000 })), { estado: 'ok', ratio: 0.9 })
})

test('capital < 90 % → infraseguro con ratio y faltante hasta el valor entero', () => {
  assert.deepEqual(alertaInfraseguro(e({ capitalContinente: 8_999_999 })), {
    estado: 'infraseguro', ratio: 0.8999999, faltante: 1_000_001,
  })
})

test('sin capital o sin valor estimado → sin_dato, nunca ok ni infraseguro', () => {
  assert.deepEqual(alertaInfraseguro(e({ capitalContinente: null })), { estado: 'sin_dato', motivo: 'sin_capital' })
  assert.deepEqual(alertaInfraseguro(e({ capitalContinente: 0 })), { estado: 'sin_dato', motivo: 'sin_capital' })
  assert.deepEqual(alertaInfraseguro(e({ valorEstimado: null })), { estado: 'sin_dato', motivo: 'sin_valor_estimado' })
  assert.deepEqual(alertaInfraseguro(e({ valorEstimado: 0, capitalContinente: null })), { estado: 'sin_dato', motivo: 'sin_valor_estimado' })
  assert.deepEqual(alertaInfraseguro(e({ valorEstimado: Number.NaN })), { estado: 'sin_dato', motivo: 'sin_valor_estimado' })
})

test('en comunidad sin póliza de comunidad enlazada: capital bajo → «no lo sabemos», no infraseguro', () => {
  assert.deepEqual(alertaInfraseguro(e({ capitalContinente: 1_000_000, enComunidad: true })), {
    estado: 'sin_dato', motivo: 'comunidad_sin_poliza',
  })
})

test('en comunidad CON su póliza enlazada sí se afirma infraseguro', () => {
  const r = alertaInfraseguro(e({ capitalContinente: 1_000_000, enComunidad: true, polizaComunidadEnlazada: true }))
  assert.equal(r.estado, 'infraseguro')
})

test('no consta si está en comunidad: capital bajo → sin_dato (estado conservador)', () => {
  assert.deepEqual(alertaInfraseguro(e({ capitalContinente: 1_000_000, enComunidad: null })), {
    estado: 'sin_dato', motivo: 'comunidad_no_consta',
  })
})

test('un capital propio que ya cubre el umbral es ok aunque sea de comunidad o no conste', () => {
  assert.equal(alertaInfraseguro(e({ enComunidad: true })).estado, 'ok')
  assert.equal(alertaInfraseguro(e({ enComunidad: null })).estado, 'ok')
})
