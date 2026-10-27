import { test } from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { sueloFindePropietario } from "./pricing-suelo-finde.ts"

// Fechas RELATIVAS a un `hoy` inyectado (nada de fechas fijas contra el reloj): el próximo
// viernes/sábado/domingo… a partir de hoy, en UTC como el motor.
const iso = (d: Date) => d.toISOString().slice(0, 10)
function proximo(hoy: Date, dow: number): string {
  const d = new Date(Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth(), hoy.getUTCDate()))
  d.setUTCDate(d.getUTCDate() + ((dow - d.getUTCDay() + 7) % 7 || 7))
  return iso(d)
}
const hoy = new Date()

test("suelo finde propietario: viernes y sábado devuelven el suelo", () => {
  for (const dow of [5, 6]) {
    assert.equal(sueloFindePropietario({ fecha: proximo(hoy, dow), minPriceFinde: 578, maxPrice: null }), 578)
  }
})

test("suelo finde propietario: domingo a jueves no aplica", () => {
  for (const dow of [0, 1, 2, 3, 4]) {
    assert.equal(sueloFindePropietario({ fecha: proximo(hoy, dow), minPriceFinde: 578, maxPrice: null }), null)
  }
})

test("suelo finde propietario: NULL o ≤0 = sin efecto", () => {
  const vie = proximo(hoy, 5)
  assert.equal(sueloFindePropietario({ fecha: vie, minPriceFinde: null, maxPrice: null }), null)
  assert.equal(sueloFindePropietario({ fecha: vie, minPriceFinde: 0, maxPrice: null }), null)
})

test("suelo finde propietario: max_price le gana", () => {
  assert.equal(sueloFindePropietario({ fecha: proximo(hoy, 6), minPriceFinde: 578, maxPrice: 500 }), 500)
})

// Réplica del orden del apply: raíl ±max_change_pct sobre el ancla de ayer → suelo del propietario.
// Caso real: 30/04/2027 bajada de 608 a 576 con suelo 578 → el raíl no impide subir al suelo.
test("suelo finde propietario: el raíl no impide saltar al suelo de golpe", () => {
  const vie = proximo(hoy, 5)
  const ancla = 300, maxChange = 0.2, objetivoMotor = 340
  let target = Math.min(Math.max(objetivoMotor, Math.round(ancla * (1 - maxChange))), Math.round(ancla * (1 + maxChange)))
  assert.equal(target, 340)                        // el raíl deja como mucho 360
  const s = sueloFindePropietario({ fecha: vie, minPriceFinde: 578, maxPrice: null })
  if (s != null && target < s) target = s
  assert.equal(target, 578)                        // +93% en una pasada: el suelo no pasa por el raíl
})

// Cepo del ORDEN en el apply real: si el suelo se mueve antes del raíl o de los techos, el raíl
// (±20%/día) o un techo de mercado lo recortarían y el finde volvería a venderse bajo el suelo.
test("apply: el suelo vie/sáb va después del raíl y de los techos, y la banda muerta lo respeta", () => {
  const src = readFileSync(new URL("../../app/api/sivra/pricing/apply/route.ts", import.meta.url), "utf8")
  const suelo = src.indexOf("sueloFindePropietario({")
  assert.ok(suelo > 0, "el apply no llama a sueloFindePropietario")
  assert.ok(suelo > src.indexOf("target = clamp(target, lo, hi)"), "el suelo va antes del raíl")
  assert.ok(suelo > src.indexOf("acotarPorTecho({ target, techo: tAdr.techo"), "el suelo va antes del techo por ADR")
  assert.ok(suelo < src.indexOf("const liberaTecho = acote.liberaCongelacion"), "el suelo va después de las guardas")
  assert.match(src, /\(sFindeProp == null \|\| old >= sFindeProp\)/, "la banda muerta del 3% se traga la subida al suelo")
})
