import { test } from 'node:test'
import assert from 'node:assert/strict'
import { costearElaboracion, rentabilidadEvento } from '../src/costes.ts'

test('costea una elaboración: ingredientes + tiempo·coste_min, y coste por unidad', () => {
  // 2 kg patata a 1,5 € + 30 min a 0,2 €/min = 3 + 6 = 9 €, 6 raciones → 1,5 €/ración
  const r = costearElaboracion({
    ingredientes: [{ coste: 3 }],
    minutos: 30,
    coste_min: 0.2,
    unidades: 6,
  })
  assert.equal(r.coste_total, 9)
  assert.equal(r.coste_unitario, 1.5)
})

test('sin unidades, coste_unitario es null (un fondo a granel)', () => {
  const r = costearElaboracion({ ingredientes: [{ coste: 10 }], minutos: 0, coste_min: 0.2 })
  assert.equal(r.coste_total, 10)
  assert.equal(r.coste_unitario, null)
})

test('rentabilidad de evento: margen y % sobre ingresos', () => {
  const r = rentabilidadEvento({ ingresos: 1000, coste_materia: 300, coste_personal: 200 })
  assert.equal(r.coste_total, 500)
  assert.equal(r.margen, 500)
  assert.equal(r.margen_pct, 50)
  assert.equal(r.en_perdidas, false)
})

test('rentabilidad: alerta si el margen cae por debajo del umbral', () => {
  // boda que solo deja 5 € de 1000 → margen 0,5%, bajo el umbral del 15%
  const r = rentabilidadEvento({ ingresos: 1000, coste_materia: 700, coste_personal: 295, umbral_pct: 15 })
  assert.equal(r.margen, 5)
  assert.equal(r.bajo_umbral, true)
})

test('rentabilidad: en pérdidas cuando los costes superan los ingresos', () => {
  const r = rentabilidadEvento({ ingresos: 100, coste_materia: 80, coste_personal: 40 })
  assert.equal(r.margen, -20)
  assert.equal(r.en_perdidas, true)
})

test('rentabilidad: ingresos 0 no rompe el % (margen_pct = 0)', () => {
  const r = rentabilidadEvento({ ingresos: 0, coste_materia: 0, coste_personal: 0 })
  assert.equal(r.margen_pct, 0)
})
