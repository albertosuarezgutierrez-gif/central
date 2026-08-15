import { test } from "node:test"
import assert from "node:assert/strict"
import { acotarSueloPL } from "./pricing-suelo-pl.ts"

// El caso fundacional: Busto Reform la noche del 15/08/2026. Referencia "PL" contaminada a 449€
// (eco del propio motor), mediana fiable de esa fecha 77€ (10 comps del conector, 2 plazas).
test("suelo PL: el mercado fiable de la fecha acota una referencia disparatada", () => {
  const r = acotarSueloPL({ plRef: 449, ratio: 0.85, anclaFecha: 77 })
  assert.equal(r.floor, Math.round(77 * 1.2))
  assert.equal(r.acotado, true)
})

// La noche especial que el suelo protege: PL conocía el puente del Pilar y el mercado de esa fecha
// también es caro → el cap queda por encima del suelo y NO muerde.
test("suelo PL: una noche cara respaldada por su mercado conserva el suelo PL íntegro", () => {
  const r = acotarSueloPL({ plRef: 392, ratio: 0.85, anclaFecha: 380 })
  assert.equal(r.floor, Math.round(392 * 0.85))
  assert.equal(r.acotado, false)
})

// El punto ciego original: sin comps fiables de la fecha (ancla 0) el suelo sigue intacto —
// acotar contra un mercado que no se ha medido sería otro «no lo sé» disfrazado de dato.
test("suelo PL: sin ancla fiable de la fecha no se acota nada", () => {
  const r = acotarSueloPL({ plRef: 392, ratio: 0.85, anclaFecha: 0 })
  assert.equal(r.floor, Math.round(392 * 0.85))
  assert.equal(r.acotado, false)
})

test("suelo PL: el margen es configurable y el cap usa el ancla, no el plRef", () => {
  const r = acotarSueloPL({ plRef: 500, ratio: 0.85, anclaFecha: 100, margen: 1.5 })
  assert.equal(r.floor, 150)
  assert.equal(r.acotado, true)
})

test("suelo PL: acotado=false cuando el cap empata o supera el suelo base", () => {
  // base = 85; cap = 85 → no se considera acotado (no cambió nada)
  const r = acotarSueloPL({ plRef: 100, ratio: 0.85, anclaFecha: 71, margen: 1.2 })
  assert.equal(r.floor, 85)
  assert.equal(r.acotado, false)
})

test("suelo PL: entradas raras no lanzan (ancla negativa/NaN se tratan como sin evidencia)", () => {
  assert.deepEqual(acotarSueloPL({ plRef: 200, ratio: 0.85, anclaFecha: -5 }), { floor: 170, acotado: false })
  assert.deepEqual(acotarSueloPL({ plRef: 200, ratio: 0.85, anclaFecha: NaN }), { floor: 170, acotado: false })
})
