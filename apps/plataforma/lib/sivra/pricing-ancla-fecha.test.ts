import { test } from "node:test"
import assert from "node:assert/strict"
import { anclaMercadoFecha } from "./pricing-ancla-fecha.ts"

// El caso fundacional: sábado 17-oct-2026 de Luxury. Mercado fiable de ESA fecha 258,50€ (28 comps),
// bucket de octubre 250€ → el motor lo vendió a 194€ de lista (170,87€ efectivos, −36% del p50).
test("ancla: el finde con mediana fiable de su fecha sube la base hasta esa mediana ajustada", () => {
  const ancla = anclaMercadoFecha({ medFechaGuest: 258.5, comps: 28, fuente: "fiable", markup: 1, dqFactor: 0.94 })
  assert.equal(ancla, Math.round(258.5 * 0.94))
})

test("ancla: NO dispara con corpus mixto (snippets de Serper fabricarían findes)", () => {
  const ancla = anclaMercadoFecha({ medFechaGuest: 258.5, comps: 28, fuente: "mixto", markup: 1, dqFactor: 0.94 })
  assert.equal(ancla, 0)
})

test("ancla: NO dispara con muestra pobre (<5 comps) aunque sea fiable", () => {
  const ancla = anclaMercadoFecha({ medFechaGuest: 258.5, comps: 4, fuente: "fiable", markup: 1, dqFactor: 0.94 })
  assert.equal(ancla, 0)
})

test("ancla: respeta el markup de canal (guest → base)", () => {
  const ancla = anclaMercadoFecha({ medFechaGuest: 232, comps: 10, fuente: "fiable", markup: 1.16, dqFactor: 1 })
  assert.equal(ancla, 200)
})

test("ancla: entradas inválidas devuelven 0, nunca lanzan", () => {
  assert.equal(anclaMercadoFecha({ medFechaGuest: 0, comps: 10, fuente: "fiable", markup: 1, dqFactor: 1 }), 0)
  assert.equal(anclaMercadoFecha({ medFechaGuest: 200, comps: 10, fuente: "fiable", markup: 0, dqFactor: 1 }), 0)
  assert.equal(anclaMercadoFecha({ medFechaGuest: 200, comps: 10, fuente: "fiable", markup: 1, dqFactor: 0 }), 0)
})

test("ancla: umbral de comps configurable", () => {
  const ancla = anclaMercadoFecha(
    { medFechaGuest: 258.5, comps: 4, fuente: "fiable", markup: 1, dqFactor: 1 },
    { minComps: 3 },
  )
  assert.equal(ancla, Math.round(258.5))
})
