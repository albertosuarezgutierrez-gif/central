import { test } from "node:test"
import assert from "node:assert/strict"
import { fugaCanal, type ReservaCobrada } from "./pricing-fuga-canal.ts"

// Canal de House Sevillana el 07/09/2026 (pricing_settings): escaparate = 1,056 × base + 120,5€/estancia.
// El 1,056 es Standard Rate (base × 1,20) × Basic Deal 0,88; la cuota es la limpieza (extranet, 07/09).
const HOUSE = { markup: 1.056, cuotaFija: 120.5, nochesRef: 2 }

// El caso fundacional: 154638741, 2 noches, bruto 981,02€ (861,02€ de alojamiento + 120€ de limpieza),
// base media 533€ → 430,26€/noche de alojamiento contra 563€ de lista pública: 0,764. El extranet lo
// desglosa: Basic Deal 12 % × móvil 10 % × Genius 15 % = 0,6732 del Standard Rate (628€ y 651€).
const IRATI: ReservaCobrada = { reservationId: "154638741", nights: 2, brutoTotal: 981.02, baseMedia: 533, checkIn: "2027-03-05" }

test("fuga: sin reservas no hay ratio — null, no 1", () => {
  const r = fugaCanal([], HOUSE)
  assert.equal(r.estado, "sin_reservas")
  assert.equal(r.ratio, null)
  assert.equal(r.eurosBajoLista, null)
})

test("fuga: con menos de minReservas se informa el ratio pero NO se juzga", () => {
  const r = fugaCanal([IRATI], HOUSE)
  assert.equal(r.estado, "muestra_corta")
  assert.equal(r.n, 1)
  assert.equal(r.ratio, 0.764)
  assert.equal(r.peores[0].cobradoNoche, 430)
  assert.equal(r.peores[0].listaNoche, 563)
})

test("fuga: la limpieza se resta ANTES de dividir — compararla como alojamiento infla el ratio", () => {
  // Misma reserva, sin cuota en el canal: el bruto entero pasa por alojamiento y el ratio sube a 0,871.
  // Ese 0,871 fue el número de la primera versión de este módulo, y era optimista en 11 puntos.
  const sinCuota = fugaCanal([IRATI], { ...HOUSE, cuotaFija: 0 })
  assert.equal(sinCuota.ratio, 0.871)
  assert.ok(fugaCanal([IRATI], HOUSE).ratio! < sinCuota.ratio!)
})

test("fuga: las 12 reservas reales de House desde el 15/07/2026 → fuga, mediana 0,765 = la pila Genius×móvil", () => {
  // (noches, bruto con limpieza, base media) medidos en incomes × pricing_applied el 07/09/2026.
  // Diez de las doce caen en 0,763-0,766: 0,6732 / 0,88 = 0,765. No son casos sueltos: es la tarifa.
  const reales: [number, number, number][] = [
    [2, 981.02, 533], [3, 2094.49, 814], [4, 3041.68, 904], [2, 1684.52, 968], [3, 1918.18, 778],
    [2, 1154.71, 640], [2, 1467.08, 834], [3, 1199.81, 445], [2, 639.71, 322], [2, 1263.77, 708],
    [3, 1872.2, 803], [4, 2642.88, 700],
  ]
  const r = fugaCanal(reales.map(([nights, brutoTotal, baseMedia], i) => ({ reservationId: `r${i}`, nights, brutoTotal, baseMedia })), HOUSE)
  assert.equal(r.estado, "fuga")
  assert.equal(r.n, 12)
  assert.equal(r.ratio, 0.765)
  assert.equal(r.eurosBajoLista, 5717)
  assert.equal(r.peores.length, 3)
  assert.ok(r.peores[0].ratio <= r.peores[1].ratio)
  // la peor (0,689) es la pila + country rate 10 % en no reembolsable: 0,765 × 0,9
  assert.equal(Number(r.peores[0].ratio.toFixed(3)), 0.689)
})

test("fuga: cobrado en línea con la lista pública → ok", () => {
  const bien = Array.from({ length: 6 }, (_, i) => ({ reservationId: `b${i}`, nights: 2, brutoTotal: 2 * 533 * 1.056 * 0.97 + 120.5, baseMedia: 533 }))
  const r = fugaCanal(bien, HOUSE)
  assert.equal(r.estado, "ok")
  assert.equal(r.ratio, 0.97)
})

test("fuga: la reserva que el motor no había tarifado se cuenta aparte y no entra en la mediana", () => {
  const r = fugaCanal([IRATI, { reservationId: "x", nights: 2, brutoTotal: 100, baseMedia: null }], HOUSE)
  assert.equal(r.n, 1)
  assert.equal(r.nSinBase, 1)
  assert.equal(r.ratio, 0.764)
})

test("fuga: un bruto que no cubre ni la limpieza es dato raro, no una fuga del 100 %", () => {
  const r = fugaCanal([IRATI, { reservationId: "raro", nights: 2, brutoTotal: 80, baseMedia: 533 }], HOUSE)
  assert.equal(r.n, 1)
  assert.equal(r.nBrutoRaro, 1)
  assert.equal(r.ratio, 0.764)
})

test("fuga: el umbral es configurable y la mediana no se deja arrastrar por una reserva rara", () => {
  const seis = Array.from({ length: 5 }, (_, i) => ({ reservationId: `n${i}`, nights: 2, brutoTotal: 2 * 533 * 1.056 + 120.5, baseMedia: 533 }))
  const r = fugaCanal([...seis, { reservationId: "outlier", nights: 2, brutoTotal: 200, baseMedia: 533 }], HOUSE, { umbral: 0.95 })
  assert.equal(r.estado, "ok")
  assert.equal(r.peores[0].reservationId, "outlier")
})
