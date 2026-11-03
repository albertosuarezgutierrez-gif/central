import { test } from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { decidirCapaFinal, CAPAS_FINAL, type CapaInput } from "./pricing-capa-final.ts"

const base: CapaInput = {
  precioFinal: 500, maxPrice: null, minPrice: 300, sueloEstacional: null,
  sueloPropietarioSubio: false, sueloPropietarioOrigen: null, sueloFindeAutoSubio: false,
  techoActuo: false, railActuo: false, prima: null,
}
const con = (o: Partial<CapaInput>) => decidirCapaFinal({ ...base, ...o })

test("mercado: nada actuó", () => assert.equal(con({}), "mercado"))
test("prima: noche con prima y nada más", () => assert.equal(con({ prima: 1.1 }), "prima"))
test("prima 1 o null no cuenta", () => { assert.equal(con({ prima: 1 }), "mercado"); assert.equal(con({ prima: null }), "mercado") })
test("rail", () => assert.equal(con({ railActuo: true, prima: 1.1 }), "rail"))
test("techo gana a rail y prima", () => assert.equal(con({ techoActuo: true, railActuo: true, prima: 1.1 }), "techo"))
test("suelo_finde automático", () => assert.equal(con({ sueloFindeAutoSubio: true, railActuo: true }), "suelo_finde"))
test("min_price", () => assert.equal(con({ precioFinal: 300, techoActuo: true }), "min_price"))
test("suelo_estacional mayor que min_price", () =>
  assert.equal(con({ precioFinal: 330, sueloEstacional: 330 }), "suelo_estacional"))
test("estacional igual a min_price cuenta como min_price", () =>
  assert.equal(con({ precioFinal: 300, sueloEstacional: 300 }), "min_price"))
test("max_price", () => assert.equal(con({ precioFinal: 800, maxPrice: 800, techoActuo: true }), "max_price"))
test("suelo_finde del propietario", () =>
  assert.equal(con({ sueloPropietarioSubio: true, sueloPropietarioOrigen: "finde", maxPrice: 500, precioFinal: 500 }), "suelo_finde"))
test("suelo_fecha del propietario", () =>
  assert.equal(con({ sueloPropietarioSubio: true, sueloPropietarioOrigen: "fecha" }), "suelo_fecha"))
test("todas las capas del vocabulario son alcanzables", () => {
  const vistas = new Set([
    con({}), con({ prima: 1.1 }), con({ railActuo: true }), con({ techoActuo: true }),
    con({ sueloFindeAutoSubio: true }), con({ precioFinal: 300 }),
    con({ precioFinal: 330, sueloEstacional: 330 }), con({ precioFinal: 800, maxPrice: 800 }),
    con({ sueloPropietarioSubio: true, sueloPropietarioOrigen: "fecha" }),
  ])
  assert.deepEqual([...vistas].sort(), [...CAPAS_FINAL].sort())
})

// ─── Cepo de la ruta: el INSERT de pricing_applied lleva las 4 columnas ─────────────────────────
const ruta = readFileSync(new URL("../../app/api/sivra/pricing/apply/route.ts", import.meta.url), "utf8")
test("el INSERT de pricing_applied incluye prima_finde, factor_semana, suelo_propietario y capa_final", () => {
  const m = ruta.match(/INSERT INTO pricing_applied \(([^)]*)\)/)
  assert.ok(m, "no se encuentra el INSERT INTO pricing_applied")
  const cols = m![1].split(",").map(s => s.trim())
  for (const c of ["prima_finde", "factor_semana", "suelo_propietario", "capa_final"]) {
    assert.ok(cols.includes(c), `el INSERT no escribe ${c}`)
  }
  assert.match(ruta, /decidirCapaFinal\(/, "la ruta no llama a decidirCapaFinal")
})
test("la migración declara las 4 columnas y el vocabulario de capas", () => {
  const sql = readFileSync(new URL("../../prisma/sql/2026-11-03_pricing_applied_capas.sql", import.meta.url), "utf8")
  for (const c of ["prima_finde", "factor_semana", "suelo_propietario", "capa_final"]) {
    assert.match(sql, new RegExp(`ADD COLUMN IF NOT EXISTS ${c} `))
  }
  for (const capa of CAPAS_FINAL) assert.ok(sql.includes(capa), `la migración no documenta ${capa}`)
})
