import { test } from "node:test"
import assert from "node:assert/strict"
import { fugaCanal, type ReservaCobrada } from "./pricing-fuga-canal.ts"

// Canal de House Sevillana el 07/09/2026 (pricing_settings): escaparate = 1,056 × base + 120,5€/estancia.
const HOUSE = { markup: 1.056, cuotaFija: 120.5, nochesRef: 2 }

// El caso fundacional: 154638741, 2 noches, bruto 981,02€, base media 533€ → cobrado 490,51/noche
// contra 563€ de base×markup (0,871) y 623€ de lista (0,787).
const IRATI: ReservaCobrada = { reservationId: "154638741", nights: 2, brutoTotal: 981.02, baseMedia: 533, checkIn: "2027-03-05" }

test("fuga: sin reservas no hay ratio — null, no 1", () => {
  const r = fugaCanal([], HOUSE)
  assert.equal(r.estado, "sin_reservas")
  assert.equal(r.ratioSinCuota, null)
  assert.equal(r.eurosBajoBase, null)
})

test("fuga: con menos de minReservas se informa el ratio pero NO se juzga", () => {
  const r = fugaCanal([IRATI], HOUSE)
  assert.equal(r.estado, "muestra_corta")
  assert.equal(r.n, 1)
  assert.equal(r.ratioSinCuota, 0.871)
  assert.equal(r.ratioLista, 0.787)
})

test("fuga: las 12 reservas reales de House desde el 15/07/2026 → fuga (mediana 0,88 de la base)", () => {
  // (bruto/noche, base media) medidos en incomes × pricing_applied el 07/09/2026
  const reales: [number, number, number][] = [
    [2, 981.02, 533], [3, 2094.49, 814], [4, 3041.68, 904], [2, 1684.52, 968], [3, 1918.18, 778],
    [2, 1154.71, 640], [2, 1467.08, 834], [3, 1199.81, 445], [2, 639.71, 322], [2, 1263.77, 708],
    [3, 1872.2, 803], [4, 2642.88, 700],
  ]
  const r = fugaCanal(reales.map(([nights, brutoTotal, baseMedia], i) => ({ reservationId: `r${i}`, nights, brutoTotal, baseMedia })), HOUSE)
  assert.equal(r.estado, "fuga")
  assert.equal(r.n, 12)
  assert.ok(r.ratioSinCuota! < 0.9 && r.ratioSinCuota! > 0.8, `ratio ${r.ratioSinCuota}`)
  assert.ok(r.eurosBajoBase! > 2000, `euros ${r.eurosBajoBase}`)
  assert.equal(r.peores.length, 3)
  assert.ok(r.peores[0].ratioSinCuota <= r.peores[1].ratioSinCuota)
})

test("fuga: cobrado en línea con la base → ok, y nunca fuga por la cuota fija", () => {
  const bien = Array.from({ length: 6 }, (_, i) => ({ reservationId: `b${i}`, nights: 2, brutoTotal: 2 * 533 * 1.056 * 0.97, baseMedia: 533 }))
  const r = fugaCanal(bien, HOUSE)
  assert.equal(r.estado, "ok")
  assert.ok(r.ratioLista! < r.ratioSinCuota!, "la lista completa (con cuota) siempre da ratio menor")
})

test("fuga: la reserva que el motor no había tarifado se cuenta aparte y no entra en la mediana", () => {
  const r = fugaCanal([IRATI, { reservationId: "x", nights: 2, brutoTotal: 100, baseMedia: null }], HOUSE)
  assert.equal(r.n, 1)
  assert.equal(r.nSinBase, 1)
  assert.equal(r.ratioSinCuota, 0.871)
})

test("fuga: el umbral es configurable y la mediana no se deja arrastrar por una reserva rara", () => {
  const seis = Array.from({ length: 5 }, (_, i) => ({ reservationId: `n${i}`, nights: 2, brutoTotal: 2 * 533 * 1.056, baseMedia: 533 }))
  const r = fugaCanal([...seis, { reservationId: "outlier", nights: 2, brutoTotal: 200, baseMedia: 533 }], HOUSE, { umbral: 0.95 })
  assert.equal(r.estado, "ok")
  assert.equal(r.peores[0].reservationId, "outlier")
})
