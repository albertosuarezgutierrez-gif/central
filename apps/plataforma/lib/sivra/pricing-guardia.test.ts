import { test } from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { decidirSubMercado, decidirReservaBaja, causaReservaBaja } from "./pricing-guardia.ts"

test("sub-mercado: dispara cuando la media va por debajo y la mayoría de fechas también", () => {
  // Caso genuino (p.ej. septiembre entero a 128 vs mercado ~185 una vez barrido).
  const r = decidirSubMercado({ datesMatched: 6, datesSub: 5, avgLive: 128, avgP50: 185 })
  assert.equal(r.alerta, true)
  assert.ok(r.diffPct < -20)
})

test("sub-mercado: NO dispara si la MEDIA está por encima aunque haya fechas sueltas por debajo", () => {
  // Caso real 20/07: las fechas casadas son de valor alto (vivo 273 > mercado 196); 3/8 por debajo.
  const r = decidirSubMercado({ datesMatched: 8, datesSub: 3, avgLive: 273, avgP50: 196 })
  assert.equal(r.alerta, false)
})

test("sub-mercado: NO dispara con pocas fechas casadas (evita falsa alarma)", () => {
  const r = decidirSubMercado({ datesMatched: 2, datesSub: 2, avgLive: 100, avgP50: 185 })
  assert.equal(r.alerta, false)
})

test("sub-mercado: NO dispara si va por debajo en menos de la mitad de fechas", () => {
  const r = decidirSubMercado({ datesMatched: 10, datesSub: 4, avgLive: 170, avgP50: 185 })
  assert.equal(r.alerta, false)
})

test("reserva baja: dispara a 40% por debajo (caso Luxury 111 vs 192)", () => {
  const r = decidirReservaBaja({ adr: 111, marketP50: 192, comps: 160, fechaEspecifica: true })
  assert.equal(r.alerta, true)
  assert.ok(r.diffPct < -25)
})

test("reserva baja: NO dispara con descuento normal de canal (~12%)", () => {
  const r = decidirReservaBaja({ adr: 169, marketP50: 192, comps: 160, fechaEspecifica: true })
  assert.equal(r.alerta, false)
})

test("reserva baja: NO dispara con muestra de mercado pobre (p.ej. House 20 comps)", () => {
  const r = decidirReservaBaja({ adr: 334, marketP50: 861, comps: 20, fechaEspecifica: true })
  assert.equal(r.alerta, false)
})

test("reserva baja: NO dispara sin p50", () => {
  const r = decidirReservaBaja({ adr: 90, marketP50: 0, comps: 50, fechaEspecifica: true })
  assert.equal(r.alerta, false)
})

test("reserva baja: con p50 POR FECHA (pocos comps) se fía al bajar minComps a 8 — caso Karol G 344 vs 931", () => {
  // El guard pasa minComps:8 cuando el p50 es de la fecha exacta (barrido de evento, ~10 comps). Con
  // el minComps por defecto (25) esta reserva NO dispararía pese a ir 63% por debajo de su mercado real.
  const sinBajarBar = decidirReservaBaja({ adr: 344, marketP50: 931, comps: 10, fechaEspecifica: true })
  assert.equal(sinBajarBar.alerta, false)
  const conFecha = decidirReservaBaja({ adr: 344, marketP50: 931, comps: 10, fechaEspecifica: true }, { minComps: 8 })
  assert.equal(conFecha.alerta, true)
  assert.ok(conFecha.diffPct < -60)
})

test("reserva baja: Feria a 140 vs mercado real de la fecha 424 dispara (blended 186 lo enmascaraba)", () => {
  // Con el p50 blended (~186) daba -25% justo (no disparaba); con el p50 de la fecha (424) es -67%.
  const conBlended = decidirReservaBaja({ adr: 140, marketP50: 186, comps: 100, fechaEspecifica: false })
  assert.equal(conBlended.alerta, false)
  const conFecha = decidirReservaBaja({ adr: 140, marketP50: 424, comps: 10, fechaEspecifica: true }, { minComps: 8 })
  assert.equal(conFecha.alerta, true)
})

test("reserva baja: contra el p50 MEZCLADO del piso NO alerta, queda informativa (Duplex 28/01 y 04/02/2027)", () => {
  // Caso real 28/10/2026: −42 % y −45 % contra un mezclado de 159 €, cuando el mercado de las fechas
  // vecinas era 104-118 €. Es enero, no una reserva barata. Con 25+ comps pasa el filtro de muestra:
  // lo único que la separa de una alerta es que el p50 no es de su fecha.
  for (const adr of [92, 87]) {
    const r = decidirReservaBaja({ adr, marketP50: 159, comps: 180, fechaEspecifica: false })
    assert.equal(r.alerta, false)
    assert.equal(r.informativa, true)
    assert.ok(r.diffPct < -40)
  }
  // El MISMO número contra un p50 de su fecha sí alerta: lo que cambia es la procedencia.
  const conFecha = decidirReservaBaja({ adr: 92, marketP50: 159, comps: 10, fechaEspecifica: true }, { minComps: 8 })
  assert.equal(conFecha.alerta, true)
  assert.notEqual(conFecha.informativa, true)
})

test("reserva baja: contra el mezclado y sin ir por debajo, ni alerta ni informativa", () => {
  const r = decidirReservaBaja({ adr: 150, marketP50: 159, comps: 180, fechaEspecifica: false })
  assert.equal(r.alerta, false)
  assert.equal(r.informativa, false)
})

test('causaReservaBaja: vendida a nuestro precio → el barato es el PRECIO, no la reserva (casos reales 26/09/2026)', () => {
  assert.equal(causaReservaBaja(194, 181), 'precio')   // Luxury 30/10: pagó MÁS que lo publicado
  assert.equal(causaReservaBaja(80, 78), 'precio')     // Busto Reform 08/10
  assert.equal(causaReservaBaja(106, 100), 'precio')
})

test('causaReservaBaja: pagó bastante menos de lo publicado → descuento de canal', () => {
  assert.equal(causaReservaBaja(93, 131), 'descuento')   // Dúplex 01/01/2027: 0,71×
  assert.equal(causaReservaBaja(284, 373), 'descuento')  // Dúplex 12/06/2027: 0,76×
  assert.equal(causaReservaBaja(90, 129), 'descuento')   // Busto Reform 29/12: 0,70×
})

test('causaReservaBaja: sin precio publicado no se afirma ninguna causa', () => {
  assert.equal(causaReservaBaja(90, null), null)
  assert.equal(causaReservaBaja(90, undefined), null)
  assert.equal(causaReservaBaja(90, 0), null)
})

test('guard #5 no compara como bruto el importe de canales sin bruto real (lee el fuente)', async () => {
  const { readFileSync } = await import('node:fs')
  const src = readFileSync(new URL('../../app/api/sivra/pricing/guard/route.ts', import.meta.url), 'utf8')
  assert.match(src, /\(i\.amount_gross <> i\.amount OR i\.portal = 'DIRECTO'\) AS bruto_real/)
  assert.match(src, /\.filter\(r => r\.bruto_real\)/)
})

// Cepo sobre el FUENTE del guardián: `fechaEspecifica` es obligatorio en el tipo, pero tsc no impide
// pasarle `true` a piñón. Tiene que salir de `date_specific` (md.p50 IS NOT NULL) de la consulta.
test("el guardián pasa la procedencia REAL del p50 (date_specific) a decidirReservaBaja", () => {
  const src = readFileSync(new URL("../../app/api/sivra/pricing/guard/route.ts", import.meta.url), "utf8")
  assert.match(src, /fechaEspecifica: r\.date_specific === true/)
  assert.match(src, /\(md\.p50 IS NOT NULL\) AS date_specific/)
  assert.match(src, /reservas_bajas_sin_mercado_fecha:/)
})
