import { test } from "node:test"
import assert from "node:assert/strict"
import { anclaMercadoFecha } from "./pricing-ancla-fecha.ts"

// El caso fundacional: sábado 17-oct-2026 de Luxury. Mercado fiable de ESA fecha 258,50€ (28 comps),
// bucket de octubre 250€ → el motor lo vendió a 194€ de lista (170,87€ efectivos, −36% del p50).
test("ancla: el finde con mediana fiable de su fecha sube la base hasta esa mediana ajustada", () => {
  const ancla = anclaMercadoFecha({ medFechaGuest: 258.5, comps: 28, fuente: "fiable", markup: 1, fijoNoche: 0, dqFactor: 0.94 })
  assert.equal(ancla, Math.round(258.5 * 0.94))
})

test("ancla: NO dispara con corpus mixto (snippets de Serper fabricarían findes)", () => {
  const ancla = anclaMercadoFecha({ medFechaGuest: 258.5, comps: 28, fuente: "mixto", markup: 1, fijoNoche: 0, dqFactor: 0.94 })
  assert.equal(ancla, 0)
})

test("ancla: NO dispara con muestra pobre (<5 comps) aunque sea fiable", () => {
  const ancla = anclaMercadoFecha({ medFechaGuest: 258.5, comps: 4, fuente: "fiable", markup: 1, fijoNoche: 0, dqFactor: 0.94 })
  assert.equal(ancla, 0)
})

test("ancla: respeta el markup de canal (guest → base)", () => {
  const ancla = anclaMercadoFecha({ medFechaGuest: 232, comps: 10, fuente: "fiable", markup: 1.16, fijoNoche: 0, dqFactor: 1 })
  assert.equal(ancla, 200)
})

test("ancla: entradas inválidas devuelven 0, nunca lanzan", () => {
  assert.equal(anclaMercadoFecha({ medFechaGuest: 0, comps: 10, fuente: "fiable", markup: 1, fijoNoche: 0, dqFactor: 1 }), 0)
  assert.equal(anclaMercadoFecha({ medFechaGuest: 200, comps: 10, fuente: "fiable", markup: 0, fijoNoche: 0, dqFactor: 1 }), 0)
  assert.equal(anclaMercadoFecha({ medFechaGuest: 200, comps: 10, fuente: "fiable", markup: 1, fijoNoche: 0, dqFactor: 0 }), 0)
})

test("ancla: umbral de comps configurable", () => {
  const ancla = anclaMercadoFecha(
    { medFechaGuest: 258.5, comps: 4, fuente: "fiable", markup: 1, fijoNoche: 0, dqFactor: 1 },
    { minComps: 3 },
  )
  assert.equal(ancla, Math.round(258.5))
})

test("🚨 la cuota fija del canal se DESCUENTA antes de dividir (House, 19/08/2026)", () => {
  // Mercado de la fecha a 1.500€/noche. Con el modelo viejo (÷1,20 y sin cuota) el ancla pedía
  // 1.250€ de base; el canal medido —×0,901 y 598€ de cuota por estancia de 2 noches— pide 1.055€.
  // Y con la cuota a 0 el mismo canal pediría 1.665€: la diferencia entre los dos NO es un matiz.
  const comun = { medFechaGuest: 1500, comps: 10, fuente: "fiable" as const, dqFactor: 1 }
  assert.equal(anclaMercadoFecha({ ...comun, markup: 1.20, fijoNoche: 0 }), 1250)
  assert.equal(anclaMercadoFecha({ ...comun, markup: 0.901, fijoNoche: 299.1 }), 1333)
  assert.ok(anclaMercadoFecha({ ...comun, markup: 0.901, fijoNoche: 0 }) > 1600)
})

test("una cuota fija mayor que el mercado NO produce un ancla negativa", () => {
  // Mercado de 80€/noche con 150€ de cuota por noche: el canal se come el precio. El ancla no puede
  // devolver un número negativo y colarse como «suelo»; quien decide no vender ahí es min_price.
  const ancla = anclaMercadoFecha(
    { medFechaGuest: 80, comps: 10, fuente: "fiable", markup: 0.95, fijoNoche: 150, dqFactor: 1 })
  assert.ok(ancla >= 1, `ancla ${ancla}`)
})
