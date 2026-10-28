import { test } from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { indexarSuelosFecha, sueloFechaPropietario, sueloPropietario, SQL_SUELOS_FECHA } from "./pricing-suelo-fecha.ts"
import { sueloFindePropietario } from "./pricing-suelo-finde.ts"

// Fechas RELATIVAS a hoy (nada de fechas fijas contra el reloj).
const iso = (d: Date) => d.toISOString().slice(0, 10)
function enDias(n: number): string {
  const d = new Date(); d.setUTCDate(d.getUTCDate() + n); return iso(d)
}
function proximo(dow: number): string {
  const d = new Date(); const h = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
  h.setUTCDate(h.getUTCDate() + ((dow - h.getUTCDay() + 7) % 7 || 7)); return iso(h)
}
const P = "prop_duplex_center"

test("suelo fecha: la fecha con fila devuelve su suelo; otra fecha u otro piso, null", () => {
  const f = enDias(150)
  const m = indexarSuelosFecha([{ property_id: P, fecha: f, suelo_base: 455 }])
  assert.equal(sueloFechaPropietario({ propertyId: P, fecha: f, suelos: m, maxPrice: null }), 455)
  assert.equal(sueloFechaPropietario({ propertyId: P, fecha: enDias(151), suelos: m, maxPrice: null }), null)
  assert.equal(sueloFechaPropietario({ propertyId: "prop_house_sevillana", fecha: f, suelos: m, maxPrice: null }), null)
})

test("suelo fecha: lectura caída (null) = sin efecto, nunca un suelo inventado", () => {
  assert.equal(sueloFechaPropietario({ propertyId: P, fecha: enDias(150), suelos: null, maxPrice: null }), null)
})

test("suelo fecha: max_price le gana", () => {
  const f = enDias(150)
  const m = indexarSuelosFecha([{ property_id: P, fecha: f, suelo_base: 455 }])
  assert.equal(sueloFechaPropietario({ propertyId: P, fecha: f, suelos: m, maxPrice: 400 }), 400)
})

test("suelo fecha: filas basura (≤0, NaN, fecha mal formada) no suben nada", () => {
  const f = enDias(150)
  const m = indexarSuelosFecha([
    { property_id: P, fecha: f, suelo_base: 0 },
    { property_id: P, fecha: enDias(151), suelo_base: "abc" },
    { property_id: P, fecha: "23/03/2027", suelo_base: 400 },
    { property_id: P, fecha: enDias(152), suelo_base: null },
  ])
  assert.equal(m.size, 0)
})

test("suelo fecha: Postgres puede devolver el entero como texto", () => {
  const f = enDias(150)
  const m = indexarSuelosFecha([{ property_id: P, fecha: f, suelo_base: "410" }])
  assert.equal(sueloFechaPropietario({ propertyId: P, fecha: f, suelos: m, maxPrice: null }), 410)
})

test("suelo finde + suelo fecha en la misma noche: manda el MAYOR", () => {
  const vie = proximo(5)
  const finde = sueloFindePropietario({ fecha: vie, minPriceFinde: 500, maxPrice: null })
  const alto = sueloFechaPropietario({ propertyId: P, fecha: vie, suelos: indexarSuelosFecha([{ property_id: P, fecha: vie, suelo_base: 620 }]), maxPrice: null })
  const bajo = sueloFechaPropietario({ propertyId: P, fecha: vie, suelos: indexarSuelosFecha([{ property_id: P, fecha: vie, suelo_base: 450 }]), maxPrice: null })
  assert.equal(sueloPropietario(finde, alto), 620)
  assert.equal(sueloPropietario(finde, bajo), 500)
  assert.equal(sueloPropietario(null, bajo), 450)
  assert.equal(sueloPropietario(finde, null), 500)
  assert.equal(sueloPropietario(null, null), null)
})

test("la lectura solo trae fechas futuras y el suelo en base", () => {
  assert.match(SQL_SUELOS_FECHA, /FROM pricing_suelos_fecha/)
  assert.match(SQL_SUELOS_FECHA, /fecha >= CURRENT_DATE/)
  assert.match(SQL_SUELOS_FECHA, /suelo_base/)
})

// ── Cepos del ORDEN en el apply real (ni tsc ni el build lo ven) ─────────────────────────────────
const SRC = readFileSync(new URL("../../app/api/sivra/pricing/apply/route.ts", import.meta.url), "utf8")

test("apply: el suelo por fecha va después de raíl y techos, antes de las guardas, en el punto del de finde", () => {
  const sf = SRC.indexOf("sueloFechaPropietario({")
  assert.ok(sf > 0, "el apply no llama a sueloFechaPropietario")
  assert.ok(sf > SRC.indexOf("target = clamp(target, lo, hi)"), "el suelo por fecha va antes del raíl")
  assert.ok(sf > SRC.indexOf("acotarPorTecho({\n        target, techo: tMkt.techo"), "el suelo por fecha va antes del techo de mercado")
  assert.ok(sf > SRC.indexOf("acotarPorTecho({ target, techo: tAdr.techo"), "el suelo por fecha va antes del techo por ADR")
  const aplica = SRC.indexOf("target = sProp")
  assert.ok(aplica > sf, "el suelo combinado no se aplica al objetivo")
  for (const guarda of [
    "const liberaTecho = acote.liberaCongelacion",
    "congelarPorCambioFuente({",
    "decidirEventoACiegas({",
    "old > normalBase * OUTLIER_RATIO",
    "ops.push({ dates: [date], daily_price: target",
  ]) {
    const i = SRC.indexOf(guarda)
    assert.ok(i > 0, `no encuentro «${guarda}» en el apply: revisa el cepo`)
    assert.ok(aplica < i, `el suelo por fecha va DESPUÉS de «${guarda}»: esa capa podría pisarlo`)
  }
})

test("apply: entre el suelo y la escritura nada reasigna `target` (solo `continue` que retienen el precio vivo)", () => {
  const desde = SRC.indexOf("target = sProp") + "target = sProp".length
  const hasta = SRC.indexOf("ops.push({ dates: [date], daily_price: target")
  const tramo = SRC.slice(desde, hasta)
  assert.doesNotMatch(tramo, /\btarget\s*=[^=]/, "una capa posterior al suelo reasigna target: podría perforarlo")
})

test("apply: la banda muerta del 3% no se traga la subida al suelo combinado", () => {
  assert.match(SRC, /\(sProp == null \|\| old >= sProp\)/)
})

test("apply: la lectura de la tabla cae a null y se declara como lectura caída", () => {
  assert.match(SRC, /lecturasCaidas\.push\(\{ nombre: 'suelos_fecha', error: String\(e\)\.slice\(0, 120\) \}\); return null \}\)/)
})

test("apply: el suelo por fecha va a la respuesta", () => {
  assert.match(SRC, /suelos_fecha: suelosFecha != null\s*\n\s*\? \{ noches: sueloFechaSubidas\.length, muestra:/)
})
