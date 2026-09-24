import { test } from "node:test"
import assert from "node:assert/strict"
import { fugaCanal, canalPorAntelacion, DIAS_ULTIMA_HORA, UMBRAL_FUGA, type ReservaCobrada } from "./pricing-fuga-canal.ts"

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

test("fuga: la pila aceptada (Genius 10 % × country 10 % = 0,81) NO es fuga; el Basic Deal encima sí", () => {
  assert.equal(UMBRAL_FUGA, 0.8)
  // lista de hoy: base × 1,20 (Standard Rate); mitad de huéspedes con Genius, mitad Genius + country
  const HOY = { markup: 1.2, cuotaFija: 120.5, nochesRef: 2 }
  const aceptada = [0.9, 0.81, 0.9, 0.81, 0.9, 0.81].map((k, i) => ({ reservationId: `a${i}`, nights: 2, brutoTotal: 2 * 533 * 1.2 * k + 120.5, baseMedia: 533 }))
  const ok = fugaCanal(aceptada, HOY)
  assert.equal(ok.estado, "ok")
  assert.equal(ok.ratio, 0.855)
  // vuelve el Basic Deal del 12 % sobre la misma mezcla → 0,79 / 0,71 → fuga
  const conBasic = aceptada.map(r => ({ ...r, brutoTotal: (r.brutoTotal - 120.5) * 0.88 + 120.5 }))
  const mal = fugaCanal(conBasic, HOY)
  assert.equal(mal.estado, "fuga")
  assert.equal(mal.ratio, 0.752)
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

// ─── Lista por tramo de antelación (24/09/2026, falsa alarma en Luxury Busto) ──────────────────
// Escaparate real de Luxury Busto (aforo 5, 19/08→22/09/2026): ≥7 días = 0,994 × base + 34,9€;
// ≤6 días = 1,107 × base + 33,6€. `pricing_settings` tenía la recta de las dos mezcladas.
const LUXURY_MOTOR = { markup: 0.987, cuotaFija: 64.1, nochesRef: 2 }
const V = (baseTotal: number, precioTotal: number, antelacionDias: number) =>
  ({ checkin: "2026-10-01", noches: 2, guests: 5, precioTotal, baseTotal, portal: "booking", antelacionDias })
const ESCAPARATE_LUXURY = [
  V(315, 348, 20), V(536, 567, 48), V(156, 190, 141), V(144, 178, 127), V(3364, 3379, 289),
  V(407, 485, 6), V(307, 373, 5), V(680, 786, 4), V(280, 343, 1), V(316, 384, 1),
]
// Las 10 reservas de Booking de Luxury Busto desde el 07/09/2026 (bruto, noches, base media, antelación).
const RESERVAS_LUXURY: ReservaCobrada[] = ([
  [224.18, 2, 96, 43], [235.21, 3, 75, 62], [360.56, 4, 96, 47], [527.02, 6, 114.7, 101],
  [160.68, 2, 75, 74], [189.6, 2, 96, 23], [298.63, 2, 156, 151], [718.64, 8, 106, 172],
  [342.22, 2, 215, 76], [149.26, 2, 72, 130],
] as const).map(([brutoTotal, nights, baseMedia, antelacionDias], i) =>
  ({ reservationId: `L${i}`, brutoTotal, nights, baseMedia, antelacionDias }))

test("lista por antelación: cada tramo sale con su propia recta, y la cuota es la limpieza de verdad", () => {
  const l = canalPorAntelacion(ESCAPARATE_LUXURY, { aforo: 5, portal: "booking", motor: LUXURY_MOTOR })
  assert.deepEqual(l.fuente, { antelacion: "medido", ultimaHora: "medido" })
  assert.ok(Math.abs(l.antelacion.markup - 0.994) < 0.02, `lejos ${l.antelacion.markup}`)
  assert.ok(Math.abs(l.ultimaHora.markup - 1.107) < 0.02, `cerca ${l.ultimaHora.markup}`)
  assert.ok(l.antelacion.cuotaFija < 45, `la ordenada de la recta mezclada (64€) no es la limpieza: ${l.antelacion.cuotaFija}`)
})

test("lista por antelación: un tramo sin ventanas cae a la recta del motor y lo dice", () => {
  const l = canalPorAntelacion(ESCAPARATE_LUXURY.filter(v => v.antelacionDias > DIAS_ULTIMA_HORA),
    { aforo: 5, portal: "booking", motor: LUXURY_MOTOR })
  assert.equal(l.fuente.ultimaHora, "motor")
  assert.deepEqual(l.ultimaHora, LUXURY_MOTOR)
})

test("fuga: Luxury Busto con la recta mezclada daba 0,72 (falsa alarma); contra su lista medida no es fuga", () => {
  const mezclada = fugaCanal(RESERVAS_LUXURY, LUXURY_MOTOR)
  assert.equal(mezclada.estado, "fuga")
  const l = canalPorAntelacion(ESCAPARATE_LUXURY, { aforo: 5, portal: "booking", motor: LUXURY_MOTOR })
  const medida = fugaCanal(RESERVAS_LUXURY, l.antelacion, { canalUltimaHora: l.ultimaHora })
  assert.equal(medida.estado, "ok", `ratio ${medida.ratio}`)
  assert.ok(medida.ratio! > UMBRAL_FUGA)
})

test("fuga: la reserva de última hora se juzga contra la lista de última hora", () => {
  const lejos = { markup: 1, cuotaFija: 30, nochesRef: 2 }
  const cerca = { markup: 1.1, cuotaFija: 30, nochesRef: 2 }
  const r = (antelacionDias: number): ReservaCobrada =>
    ({ reservationId: "x", nights: 2, brutoTotal: 230, baseMedia: 100, antelacionDias })
  assert.equal(fugaCanal([r(3)], lejos, { canalUltimaHora: cerca }).peores[0].listaNoche, 110)
  assert.equal(fugaCanal([r(30)], lejos, { canalUltimaHora: cerca }).peores[0].listaNoche, 100)
  // sin antelación conocida no se adivina el tramo: se juzga contra el principal
  assert.equal(fugaCanal([{ ...r(3), antelacionDias: null }], lejos, { canalUltimaHora: cerca }).peores[0].listaNoche, 100)
})

test("lista por antelación: una ventana absurda (13× la base) no tumba el tramo a la recta del motor", () => {
  const conBasura = [...ESCAPARATE_LUXURY, V(250, 3329, 191)]
  const l = canalPorAntelacion(conBasura, { aforo: 5, portal: "booking", motor: LUXURY_MOTOR })
  assert.equal(l.fuente.antelacion, "medido")
})
