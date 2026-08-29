import { test } from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { techoMercado, acotarPorTecho, TECHO_FECHA_RATIO, TECHO_MES_RATIO } from "./pricing-techo-mercado.ts"

const RUTA_APPLY = new URL("../../app/api/sivra/pricing/apply/route.ts", import.meta.url)

// ─── techoMercado ────────────────────────────────────────────────────────────────────────────

// Caso fundacional (25/08/2026): Duplex 29-sep-2026 con mediana fiable de SU fecha en 175€ (10
// comps) listado a 460€ de huésped — el factor 2,2 del partido multiplicó la base GLOBAL por
// encima del día medido y la guarda de outlier lo congeló ahí.
test("techo: con la fecha medida (fiable, ≥5 comps), el techo es ratio × su mediana ajustada", () => {
  const t = techoMercado({
    medFechaGuest: 175, compsFecha: 10, fuenteFecha: "fiable",
    factorEvento: 2.2, markup: 0.949, fijoNoche: 13.3, dqFactor: 1,
  })
  assert.equal(t.origen, "fecha")
  // (175 × 1,5 − 13,3) / 0,949
  assert.equal(t.techo, Math.max(1, Math.round((175 * TECHO_FECHA_RATIO - 13.3) / 0.949)))
})

test("techo: corpus mixto de la fecha NO acota (los snippets de Serper no tienen autoridad)", () => {
  const t = techoMercado({
    medFechaGuest: 175, compsFecha: 10, fuenteFecha: "mixto",
    factorEvento: 1, markup: 1, fijoNoche: 0, dqFactor: 1,
  })
  assert.equal(t.origen, null)
  assert.equal(t.techo, 0)
})

test("techo: <5 comps fiables de la fecha no bastan; cae al escalón del mes si lo hay", () => {
  const t = techoMercado({
    medFechaGuest: 175, compsFecha: 4, fuenteFecha: "fiable",
    medMesGuest: 120, fuenteMes: "fiable",
    factorEvento: 1, markup: 1, fijoNoche: 0, dqFactor: 1,
  })
  assert.equal(t.origen, "mes")
  assert.equal(t.techo, Math.round(120 * TECHO_MES_RATIO))
})

test("techo: el escalón del MES se inhibe con evento conocido (la Feria vale 3-5× su abril)", () => {
  const t = techoMercado({
    medMesGuest: 120, fuenteMes: "fiable",
    factorEvento: 1.15, markup: 1, fijoNoche: 0, dqFactor: 1,
  })
  assert.equal(t.techo, 0)
  // …pero la medición de la PROPIA fecha sí tiene autoridad sobre la noche de evento:
  const t2 = techoMercado({
    medFechaGuest: 931, compsFecha: 10, fuenteFecha: "fiable",
    medMesGuest: 109, fuenteMes: "fiable",
    factorEvento: 2.5, markup: 1, fijoNoche: 0, dqFactor: 1,
  })
  assert.equal(t2.origen, "fecha")
  // Karol G medida a 931€ → techo 1.397€: el techo NO recorta un evento real medido.
  assert.equal(t2.techo, Math.round(931 * TECHO_FECHA_RATIO))
})

test("techo: bucket del mes mixto NO acota", () => {
  const t = techoMercado({
    medMesGuest: 120, fuenteMes: "mixto",
    factorEvento: 1, markup: 1, fijoNoche: 0, dqFactor: 1,
  })
  assert.equal(t.techo, 0)
})

test("techo: sin evidencia ninguna → 0 (sin techo), nunca lanza", () => {
  assert.equal(techoMercado({ factorEvento: 1, markup: 1, fijoNoche: 0, dqFactor: 1 }).techo, 0)
  assert.equal(techoMercado({ medFechaGuest: 100, compsFecha: 10, fuenteFecha: "fiable", factorEvento: 1, markup: 0, fijoNoche: 0, dqFactor: 1 }).techo, 0)
  assert.equal(techoMercado({ medFechaGuest: 100, compsFecha: 10, fuenteFecha: "fiable", factorEvento: 1, markup: 1, fijoNoche: 0, dqFactor: 0 }).techo, 0)
})

test("techo: el ajuste demanda/calidad viaja con el techo (el mismo dq que infla el objetivo)", () => {
  const t = techoMercado({
    medFechaGuest: 100, compsFecha: 10, fuenteFecha: "fiable",
    factorEvento: 1, markup: 1, fijoNoche: 0, dqFactor: 1.1,
  })
  assert.equal(t.techo, Math.round(100 * 1.1 * TECHO_FECHA_RATIO))
})

// ─── acotarPorTecho ──────────────────────────────────────────────────────────────────────────

test("acote: sin techo (0) no toca nada ni libera congelaciones", () => {
  const a = acotarPorTecho({ target: 471, techo: 0, old: 471, railLo: 377, minPrice: 85 })
  assert.deepEqual(a, { target: 471, acotado: false, liberaCongelacion: false })
})

test("acote: el descenso va a velocidad de raíl — el suelo del día manda sobre el techo", () => {
  // Duplex 29-sep: vivo 471, techo ~264, raíl del día no deja bajar de 377 → esta pasada 377.
  const a = acotarPorTecho({ target: 471, techo: 264, old: 471, railLo: 377, minPrice: 85 })
  assert.equal(a.target, 377)
  assert.equal(a.acotado, true)
  assert.equal(a.liberaCongelacion, true)
})

test("acote: cuando el raíl ya alcanza el techo, el objetivo se queda EN el techo", () => {
  const a = acotarPorTecho({ target: 320, techo: 264, old: 320, railLo: 256, minPrice: 85 })
  assert.equal(a.target, 264)
  assert.equal(a.liberaCongelacion, true)
})

test("acote: min_price del propietario manda sobre el techo", () => {
  const a = acotarPorTecho({ target: 120, techo: 60, old: 120, railLo: 40, minPrice: 85 })
  assert.equal(a.target, 85)
})

test("acote: un precio vivo por debajo del techo NO libera congelaciones", () => {
  const a = acotarPorTecho({ target: 200, techo: 264, old: 250, railLo: 200, minPrice: null })
  assert.equal(a.acotado, false)
  assert.equal(a.liberaCongelacion, false)
})

test("acote: fecha nueva (sin precio vivo ni raíl) baja al techo de una vez", () => {
  const a = acotarPorTecho({ target: 500, techo: 264, old: null, railLo: null, minPrice: null })
  assert.equal(a.target, 264)
  assert.equal(a.liberaCongelacion, false)
})

// ─── Guardián de cableado ────────────────────────────────────────────────────────────────────
// Ni tsc ni next build pueden ver si el motor USA el techo: un import borrado o una guarda que
// vuelve a congelar sin mirar `liberaTecho` compilan igual. Mismo patrón que cols-subasta.test.ts.
test("guardián: pricing/apply usa el techo y las guardas de congelación miran su llave", () => {
  const fuente = readFileSync(RUTA_APPLY, "utf8")
  assert.match(fuente, /techoMercado\(/, "apply/route.ts ya no calcula el techo de mercado")
  assert.match(fuente, /acotarPorTecho\(/, "apply/route.ts ya no acota el objetivo por el techo")
  // Desde el 27/08/2026 la llave de las guardas es `liberaGuardas`, que SUMA la segunda llave
  // (antigüedad / rumor caído, ver pricing-descongelar.ts) al `liberaTecho` de siempre. El guardián
  // exige las dos cosas: que las guardas la miren, y que esa llave siga conteniendo el techo — si
  // alguien la redefine sin `liberaTecho`, un precio por encima del mercado medido volvería a
  // quedarse congelado y este test es lo único que lo vería.
  const guardas = fuente.match(/&& !liberaGuardas/g) ?? []
  assert.ok(
    guardas.length >= 2,
    `las guardas de congelación (outlier y Karol G) deben mirar liberaGuardas: hay ${guardas.length} de 2`,
  )
  assert.match(
    fuente,
    /const liberaGuardas = liberaTecho \|\|/,
    "liberaGuardas debe seguir incluyendo liberaTecho: el techo medido no puede dejar de abrir",
  )
})
