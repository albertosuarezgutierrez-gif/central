// Reparto del tiempo del cron `subastas-mercado`. `node --test`.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  COSTE_PETICION_PORTAL_MS,
  PRESUPUESTO_TOTAL_MS,
  RESERVA_AVISOS_MS,
  deadlineEnriquecimiento,
  motivoCorte,
  quedaTiempo,
} from './presupuesto-mercado.ts'

const T0 = 1_000_000

test('el enriquecimiento nunca puede comerse la reserva de los avisos', () => {
  const d = deadlineEnriquecimiento(T0)
  assert.equal(d, T0 + PRESUPUESTO_TOTAL_MS - RESERVA_AVISOS_MS)
  // Queda tiempo REAL para el tramo final dentro del maxDuration de 300 s.
  assert.ok(PRESUPUESTO_TOTAL_MS < 300_000, 'el techo de trabajo va por debajo del maxDuration')
  assert.ok(d - T0 + RESERVA_AVISOS_MS <= 300_000)
})

test('una reserva mayor que el presupuesto no enriquece nada (y no retrocede)', () => {
  // Caso límite: nunca se devuelve un deadline anterior al inicio, que haría
  // que `quedaTiempo` fuera falso «hacia atrás» y el corte pareciera un fallo.
  assert.equal(deadlineEnriquecimiento(T0, 10_000, 50_000), T0)
})

test('no se empieza una petición que NO cabe entera', () => {
  const d = T0 + 100_000
  // A falta de 31 s cabe una petición de 30 s; a falta de 29 s ya no.
  assert.equal(quedaTiempo(d, d - 31_000, COSTE_PETICION_PORTAL_MS), true)
  assert.equal(quedaTiempo(d, d - 29_000, COSTE_PETICION_PORTAL_MS), false)
  // Este es EXACTAMENTE el fallo del 06/08/2026: sin contar el coste de la
  // iteración, a falta de 2 s se arrancaba una llamada de 30 s y se cruzaba el
  // techo de 300 s → 504 y cero avisos.
  assert.equal(quedaTiempo(d, d - 2_000, 0), true)
  assert.equal(quedaTiempo(d, d - 2_000, COSTE_PETICION_PORTAL_MS), false)
})

test('quedaTiempo es inclusivo en el límite exacto', () => {
  assert.equal(quedaTiempo(T0, T0, 0), true)
  assert.equal(quedaTiempo(T0, T0 + 1, 0), false)
})

test('un corte por tiempo se DICE; una cola terminada no inventa aviso', () => {
  assert.equal(motivoCorte(false, '8 ficha(s)', 0), null)
  const m = motivoCorte(true, '3 ficha(s)', 5)
  assert.match(m!, /presupuesto de tiempo/)
  assert.match(m!, /3 ficha\(s\)/)
  assert.match(m!, /5 pendiente\(s\)/)
})

test('corte sin pendientes no promete una cola que no existe', () => {
  assert.equal(motivoCorte(true, '6 zona(s)', 0), 'cortado por presupuesto de tiempo tras 6 zona(s)')
})
