import { test } from "node:test"
import assert from "node:assert/strict"
import { aplicarRailesPrecio } from "./pricing-railes-propuesta.ts"

// Ajustes reales de los 4 pisos a 23/09/2026: suelo sí, techo NULL, ±20%/día.
const PISO = { min_price: 72, max_price: null, max_change_pct: 0.20 }

test("sin precio previo y sin techo: NO se escribe (antes pasaba la propuesta cruda sin acotar)", () => {
  const r = aplicarRailesPrecio({ proposed: 5000, old: null, ajustes: PISO })
  assert.deepEqual(r, { escribe: false, reason: "sin_referencia" })
})

test("precio previo 0 cuenta como sin referencia", () => {
  assert.equal(aplicarRailesPrecio({ proposed: 5000, old: 0, ajustes: PISO }).escribe, false)
})

test("sin ajustes del piso y sin precio previo: NO se escribe", () => {
  assert.equal(aplicarRailesPrecio({ proposed: 90, old: null, ajustes: undefined }).escribe, false)
})

test("sin precio previo pero con suelo y techo: se acota por los dos lados", () => {
  const r = aplicarRailesPrecio({ proposed: 5000, old: null, ajustes: { ...PISO, max_price: 300 } })
  assert.deepEqual(r, { escribe: true, target: 300, reasons: ["techo"] })
})

test("con precio previo: tope +20%/día", () => {
  const r = aplicarRailesPrecio({ proposed: 500, old: 100, ajustes: PISO })
  assert.deepEqual(r, { escribe: true, target: 120, reasons: ["tope_subida"] })
})

test("con precio previo: suelo gana al tope de bajada", () => {
  const r = aplicarRailesPrecio({ proposed: 10, old: 80, ajustes: PISO })
  assert.equal(r.escribe && r.target, 72)
})

test("propuesta dentro de rango pasa tal cual", () => {
  assert.deepEqual(aplicarRailesPrecio({ proposed: 110, old: 100, ajustes: PISO }), { escribe: true, target: 110, reasons: [] })
})
