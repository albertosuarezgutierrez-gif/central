import { test } from "node:test"
import assert from "node:assert/strict"
import { esNocheFinde, sueloFinde } from "./pricing-suelo-finde.ts"

// Caso fundacional: House, viernes 29 y sábado 30 de enero de 2027, min_price 300, sin mercado medido.
test("suelo finde: viernes y sábado sin mercado medido suben el suelo a min_price × 1,15", () => {
  for (const fecha of ["2027-01-29", "2027-01-30"]) {
    assert.equal(sueloFinde({ fecha, minPrice: 300, fechaMedida: false, factorEvento: 1 }), 345)
  }
})

test("suelo finde: domingo a jueves no aplica", () => {
  for (const fecha of ["2027-01-31", "2027-01-25", "2027-01-28"]) {
    assert.equal(esNocheFinde(fecha), false)
    assert.equal(sueloFinde({ fecha, minPrice: 300, fechaMedida: false, factorEvento: 1 }), null)
  }
})

test("suelo finde: con mercado medido de la fecha manda el mercado", () => {
  assert.equal(sueloFinde({ fecha: "2027-01-30", minPrice: 300, fechaMedida: true, factorEvento: 1 }), null)
})

test("suelo finde: en noche de evento no aplica (tiene su propio suelo)", () => {
  assert.equal(sueloFinde({ fecha: "2027-01-30", minPrice: 300, fechaMedida: false, factorEvento: 1.4 }), null)
})

test("suelo finde: sin min_price no inventa suelo", () => {
  assert.equal(sueloFinde({ fecha: "2027-01-30", minPrice: null, fechaMedida: false, factorEvento: 1 }), null)
})
