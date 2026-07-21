import { test } from "node:test"
import assert from "node:assert/strict"
import { decidirSubMercado, decidirReservaBaja } from "./pricing-guardia.ts"

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
  const r = decidirReservaBaja({ adr: 111, marketP50: 192, comps: 160 })
  assert.equal(r.alerta, true)
  assert.ok(r.diffPct < -25)
})

test("reserva baja: NO dispara con descuento normal de canal (~12%)", () => {
  const r = decidirReservaBaja({ adr: 169, marketP50: 192, comps: 160 })
  assert.equal(r.alerta, false)
})

test("reserva baja: NO dispara con muestra de mercado pobre (p.ej. House 20 comps)", () => {
  const r = decidirReservaBaja({ adr: 334, marketP50: 861, comps: 20 })
  assert.equal(r.alerta, false)
})

test("reserva baja: NO dispara sin p50", () => {
  const r = decidirReservaBaja({ adr: 90, marketP50: 0, comps: 50 })
  assert.equal(r.alerta, false)
})
