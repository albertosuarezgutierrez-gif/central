import { test } from 'node:test'
import assert from 'node:assert/strict'
import { factorAforo, elegirAforo, FACTOR_MAX, FACTOR_MIN } from './pricing-aforo.ts'

test('mismo aforo no toca el precio', () => {
  assert.equal(factorAforo(4, 4), 1)
  assert.equal(factorAforo(12, 12), 1)
})

test('datos incompletos degradan a 1 (nunca inventa un ajuste)', () => {
  assert.equal(factorAforo(null, 4), 1)
  assert.equal(factorAforo(12, undefined), 1)
  assert.equal(factorAforo(0, 4), 1)
  assert.equal(factorAforo(12, -3), 1)
})

test('el caso Socorro: comps de 8 plazas para una casa de 12 sube ~1,58 (medido, no inventado)', () => {
  const f = factorAforo(12, 8)
  assert.ok(f > 1.5 && f < 1.65, `esperado ~1,58, salió ${f}`)
  // Validación cruzada con el mercado real: p50 de comps 8p = 319€ → precio vivo real 450-522€.
  const estimado = 319 * f
  assert.ok(estimado > 450 && estimado < 560, `estimado ${estimado} fuera del precio vivo real`)
})

test('el caso Luxury: 5 plazas contra comps de 4 sube ~1,28', () => {
  const f = factorAforo(5, 4)
  assert.ok(f > 1.2 && f < 1.35, `esperado ~1,28, salió ${f}`)
})

test('un piso más pequeño que sus comps BAJA el precio', () => {
  assert.ok(factorAforo(2, 4) < 1)
})

test('el factor está acotado por los dos lados', () => {
  assert.equal(factorAforo(100, 1), FACTOR_MAX)
  assert.equal(factorAforo(1, 100), FACTOR_MIN)
})

test('prefiere el aforo EXACTO cuando tiene muestra suficiente', () => {
  const r = elegirAforo([{ guests: 8, n: 40 }, { guests: 12, n: 10 }], 12)
  assert.deepEqual(r, { guests: 12, factor: 1, exacto: true })
})

test('con el aforo exacto por debajo de la muestra mínima, extrapola del más poblado y lo declara', () => {
  const r = elegirAforo([{ guests: 8, n: 40 }, { guests: 12, n: 3 }], 12)
  assert.equal(r.guests, 8)
  assert.equal(r.exacto, false)
  assert.ok(r.factor > 1.5)
})

test('sin muestras no se inventa nada', () => {
  assert.deepEqual(elegirAforo([], 12), { guests: null, factor: 1, exacto: false })
  assert.deepEqual(elegirAforo([{ guests: 4, n: 0 }], 12), { guests: null, factor: 1, exacto: false })
})

test('Busto tarifica con sus propios comps de 2 plazas sin corrección', () => {
  const r = elegirAforo([{ guests: 2, n: 359 }], 2)
  assert.deepEqual(r, { guests: 2, factor: 1, exacto: true })
})
