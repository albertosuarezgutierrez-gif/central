import { test } from "node:test"
import assert from "node:assert/strict"
import { factorDemandaFecha } from "./pricing-demanda.ts"

// El caso fundacional: Luxury a 68 días de una fecha de octubre. Su mediana de venta de octubre es
// ~17 días (medida en incomes.reserved_at), la ocupación global del horizonte era baja y el motor le
// aplicaba el descuento de demanda a una fecha cuya venta ni siquiera había empezado.
test("demanda: fecha FUERA de la ventana de venta → el descuento se neutraliza", () => {
  const r = factorDemandaFecha({ factorDemanda: 0.94, diasVista: 68, antelacionMediana: 17, muestra: 25 })
  assert.equal(r.factor, 1)
  assert.equal(r.gateado, true)
})

test("demanda: fecha DENTRO de la ventana → descuento clásico", () => {
  const r = factorDemandaFecha({ factorDemanda: 0.94, diasVista: 10, antelacionMediana: 17, muestra: 25 })
  assert.equal(r.factor, 0.94)
  assert.equal(r.gateado, false)
})

test("demanda: el BOOST (>1) se conserva a cualquier plazo", () => {
  const r = factorDemandaFecha({ factorDemanda: 1.06, diasVista: 200, antelacionMediana: 17, muestra: 25 })
  assert.equal(r.factor, 1.06)
  assert.equal(r.gateado, false)
})

test("demanda: sin antelación medida → comportamiento clásico (no inventamos ventanas)", () => {
  const r = factorDemandaFecha({ factorDemanda: 0.92, diasVista: 120, antelacionMediana: null, muestra: 0 })
  assert.equal(r.factor, 0.92)
  assert.equal(r.gateado, false)
})

test("demanda: muestra insuficiente → comportamiento clásico", () => {
  const r = factorDemandaFecha({ factorDemanda: 0.92, diasVista: 120, antelacionMediana: 17, muestra: 4 })
  assert.equal(r.factor, 0.92)
  assert.equal(r.gateado, false)
})

test("demanda: justo en la mediana cuenta como ventana abierta (el gate es estrictamente >)", () => {
  const r = factorDemandaFecha({ factorDemanda: 0.94, diasVista: 17, antelacionMediana: 17, muestra: 25 })
  assert.equal(r.factor, 0.94)
})

test("demanda: días vista inválidos → clásico, nunca lanza", () => {
  const r = factorDemandaFecha({ factorDemanda: 0.94, diasVista: NaN, antelacionMediana: 17, muestra: 25 })
  assert.equal(r.factor, 0.94)
})
