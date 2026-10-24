import { test } from "node:test"
import assert from "node:assert/strict"
import { histeresisSentido, type HisteresisInput } from "./pricing-histeresis.ts"

// Base: Busto Reform 15/11, pasada de las 14:17 del 08/10/2026. La de las 14:15 había subido 80→88.
const base = (p: Partial<HisteresisInput> = {}): HisteresisInput => ({
  old: 88, target: 80,
  ultima: { horas: 0.03, prev: 80, ult: 88 },
  diasVista: 38, eventTarget: 0, lastMinuteActivo: false,
  minPrice: 65, maxPrice: null, railLo: 65, railHi: 97,
  ...p,
})

test("histéresis: reverso <10% dentro de 48 h se retiene (caso 88→80→88)", () => {
  assert.deepEqual(histeresisSentido(base()), { retener: true, motivo: "reverso_bajo_umbral" })
  // y al revés: bajó 88→80 y ahora quiere volver a 86
  assert.equal(histeresisSentido(base({ old: 80, target: 86, ultima: { horas: 5, prev: 88, ult: 80 } })).retener, true)
})

test("histéresis: reverso ≥10% pasa", () => {
  assert.equal(histeresisSentido(base({ target: 79 })).retener, false)
})

test("histéresis: mismo sentido pasa", () => {
  assert.equal(histeresisSentido(base({ ultima: { horas: 3, prev: 95, ult: 88 } })).motivo, "mismo_sentido")
})

test("histéresis: fuera de la ventana de 48 h pasa", () => {
  assert.equal(histeresisSentido(base({ ultima: { horas: 48, prev: 80, ult: 88 } })).retener, false)
})

test("histéresis: evento, cercana y last-minute siempre pasan", () => {
  assert.equal(histeresisSentido(base({ eventTarget: 120 })).motivo, "evento")
  assert.equal(histeresisSentido(base({ diasVista: 30 })).motivo, "cercana")
  assert.equal(histeresisSentido(base({ lastMinuteActivo: true })).motivo, "last_minute")
})

test("histéresis: nunca impide bajar a min_price ni corregir un precio bajo el suelo", () => {
  assert.equal(histeresisSentido(base({ old: 70, target: 65, ultima: { horas: 2, prev: 66, ult: 70 } })).motivo, "baja_a_min_price")
  assert.equal(histeresisSentido(base({ old: 60, target: 65, ultima: { horas: 2, prev: 62, ult: 60 } })).motivo, "bajo_min_price")
})

test("histéresis: precio fuera del raíl siempre se mueve", () => {
  assert.equal(histeresisSentido(base({ railHi: 85, railLo: 70 })).motivo, "fuera_rail")
  assert.equal(histeresisSentido(base({ old: 80, target: 86, ultima: { horas: 5, prev: 88, ult: 80 }, railLo: 82 })).motivo, "fuera_rail")
  assert.equal(histeresisSentido(base({ maxPrice: 85 })).motivo, "sobre_max_price")
})

test("histéresis: sin historial fiable se comporta como antes (no retiene)", () => {
  assert.equal(histeresisSentido(base({ ultima: null })).motivo, "sin_historial")
  assert.equal(histeresisSentido(base({ ultima: { horas: 2, prev: null, ult: 88 } })).motivo, "sin_historial")
  // el precio vivo no es el que escribimos: lo tocaron a mano
  assert.equal(histeresisSentido(base({ ultima: { horas: 2, prev: 80, ult: 92 } })).motivo, "precio_tocado_fuera")
  assert.equal(histeresisSentido(base({ old: null })).retener, false)
})
