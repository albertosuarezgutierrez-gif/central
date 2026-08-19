import { test } from "node:test"
import assert from "node:assert/strict"
import { premioMercadoFecha } from "./pricing-premio-mercado.ts"

const MARKUP = 1.16

test("premio: Karol G (mercado fecha 931, mes ~130) dispara y ancla a la fecha, no al mes", () => {
  // El mercado del día (931 guest) va ~5× la base normal de junio (~130 guest → ~112 base).
  const premio = premioMercadoFecha({ medFechaGuest: 931, comps: 10, normalBase: 112, markup: MARKUP, fijoNoche: 0, dqFactor: 1 })
  assert.ok(premio > 700, `esperaba base alta, dio ${premio}`)
  // Sin ×factor: la base ≈ 931/1.16, NO 931×2.5 (el doble conteo que infló a ~2.000€).
  assert.equal(premio, Math.round(931 / MARKUP))
})

test("premio: Feria (mercado fecha 424, mes ~186) dispara", () => {
  const premio = premioMercadoFecha({ medFechaGuest: 424, comps: 10, normalBase: 160, markup: MARKUP, fijoNoche: 0, dqFactor: 1 })
  assert.equal(premio, Math.round(424 / MARKUP)) // ~366 base
})

test("premio: NO dispara en un finde normal (mercado fecha solo 1.3× la base del mes)", () => {
  // 210 guest/1.16 ≈ 181 base; normalBase 150 → ratio 1.2 < 1.5 → no es evento, es finde.
  const premio = premioMercadoFecha({ medFechaGuest: 210, comps: 10, normalBase: 150, markup: MARKUP, fijoNoche: 0, dqFactor: 1 })
  assert.equal(premio, 0)
})

test("premio: NO dispara con muestra pobre de la fecha (<3 comps)", () => {
  const premio = premioMercadoFecha({ medFechaGuest: 931, comps: 2, normalBase: 112, markup: MARKUP, fijoNoche: 0, dqFactor: 1 })
  assert.equal(premio, 0)
})

test("premio: respeta el ajuste demanda/calidad (dqFactor) del motor", () => {
  const premio = premioMercadoFecha({ medFechaGuest: 424, comps: 10, normalBase: 150, markup: MARKUP, fijoNoche: 0, dqFactor: 1.05 })
  assert.equal(premio, Math.round((424 * 1.05) / MARKUP))
})

test("premio: umbral configurable (ratio 1.25 captura una fecha 1.3×)", () => {
  const base = premioMercadoFecha({ medFechaGuest: 278, comps: 10, normalBase: 181, markup: MARKUP, fijoNoche: 0, dqFactor: 1 })
  assert.equal(base, 0) // con el 1.5 por defecto no dispara
  const conMenor = premioMercadoFecha({ medFechaGuest: 278, comps: 10, normalBase: 181, markup: MARKUP, fijoNoche: 0, dqFactor: 1 }, { ratio: 1.25 })
  assert.ok(conMenor > 0)
})

test("🚨 el premio también descuenta la cuota fija: si no, un evento se sobrepaga", () => {
  // Karol G: mercado de la fecha 931€/noche contra una base normal de 112€. Con cuota fija de
  // 100€/noche el premio es MENOR que sin ella — el canal ya cobra esos 100€ al huésped.
  const comun = { medFechaGuest: 931, comps: 10, normalBase: 112, markup: 1.0, dqFactor: 1 }
  const sinCuota = premioMercadoFecha({ ...comun, fijoNoche: 0 })
  const conCuota = premioMercadoFecha({ ...comun, fijoNoche: 100 })
  assert.equal(sinCuota, 931)
  assert.equal(conCuota, 831)
  assert.ok(conCuota > comun.normalBase * 1.5, "sigue siendo premium: el evento no se pierde")
})
