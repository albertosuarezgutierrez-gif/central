import { test } from 'node:test'
import assert from 'node:assert/strict'
import { resumirBacktest, diasRestantesReferencia } from './pricing-rentabilidad.ts'

test('cobertura completa: delta real, negativo incluido', () => {
  const r = resumirBacktest({ property_id: 'prop_duplex_center', noches_vendidas: 9,
    con_precio_motor: 9, motor_lista: 1307, pl_lista: 1634, tiene_referencia: true })
  assert.equal(r.estado, 'completa')
  assert.equal(r.delta_eur, -327)
  assert.ok(r.delta_pct !== null && r.delta_pct < 0)
})

test('cobertura parcial: el hueco queda a la vista, no se colapsa', () => {
  const r = resumirBacktest({ property_id: 'prop_house_sevillana', noches_vendidas: 10,
    con_precio_motor: 2, motor_lista: 834, pl_lista: 900, tiene_referencia: true })
  assert.equal(r.estado, 'parcial')
  assert.equal(r.noches_sin_precio_motor, 8)
  assert.equal(r.noches_comparables, 2)
})

test('sin noches con precio motor: delta null, nunca 0', () => {
  const r = resumirBacktest({ property_id: 'prop_house_sevillana', noches_vendidas: 5,
    con_precio_motor: 0, motor_lista: null, pl_lista: null, tiene_referencia: true })
  assert.equal(r.estado, 'sin_datos')
  assert.equal(r.delta_eur, null)
  assert.equal(r.delta_pct, null)
})

test('piso sin curva PL genuina: sin_referencia, no delta 0', () => {
  const r = resumirBacktest({ property_id: 'prop_busto_reform', noches_vendidas: 20,
    con_precio_motor: 20, motor_lista: 1500, pl_lista: null, tiene_referencia: false })
  assert.equal(r.estado, 'sin_referencia')
  assert.equal(r.delta_eur, null)
})

test('caducidad de la referencia: cuenta atrás y suelo en 0', () => {
  assert.equal(diasRestantesReferencia(new Date('2026-12-05T12:00:00Z')), 1)
  assert.equal(diasRestantesReferencia(new Date('2027-01-01T00:00:00Z')), 0)
})
