import { test } from 'node:test'
import assert from 'node:assert/strict'
import { baseSaltoEvento } from './pricing-base-evento.ts'

test('con bucket del mes, el salto de evento se ancla al MES (no a la global)', () => {
  const r = baseSaltoEvento({ baseMes: 122, baseGlobal: 224 })
  assert.deepEqual(r, { base: 122, origen: 'mes' })
})

test('sin bucket del mes cae al ancla global', () => {
  const r = baseSaltoEvento({ baseMes: null, baseGlobal: 224 })
  assert.deepEqual(r, { base: 224, origen: 'global' })
})

test('una base de mes inválida NO se toma por buena: cae a la global', () => {
  // Un mes sin mercado medido no es un mes a precio cero. Si esto cayera a 0, el salto de evento
  // devolvería 0 y el motor perdería la fecha entera.
  for (const malo of [0, -10, NaN, Infinity]) {
    assert.deepEqual(baseSaltoEvento({ baseMes: malo, baseGlobal: 224 }), { base: 224, origen: 'global' })
  }
})

// 🚨 REGRESIÓN DEL SERRUCHO — Duplex Center, 16/09/2026 (Betis vs Getafe, factor 1,35).
//
// Cifras REALES de `pricing_applied` y del corpus (`market_rates`) de la semana del 18 al 25 de
// agosto de 2026. El ancla global saltó 129€ → 205€ → 146€ en tres días porque el barrido de
// Booking muestreó fechas distintas cada mañana; el bucket de septiembre se movió 122€ → 123€.
//
// Con la global, el precio hizo 158€ → 289€ (+83%) en una pasada saltándose el raíl de ±20%/día.
// Con el mes, el objetivo del evento se queda quieto: eso es lo que este test fija.
test('regresión: el objetivo del evento no se mueve aunque el ancla global se duplique', () => {
  const FACTOR = 1.35
  const objetivo = (baseMes: number | null, baseGlobal: number) =>
    Math.round(baseSaltoEvento({ baseMes, baseGlobal }).base * FACTOR)

  const dias = [
    { dia: '2026-08-23', mes: 122, global: 135 },
    { dia: '2026-08-24', mes: 123, global: 224 }, // el barrido cazó Semana Santa y Feria
    { dia: '2026-08-25', mes: 123, global: 155 }, // y al día siguiente, cinco noches de enero
  ]

  const conMes = dias.map(d => objetivo(d.mes, d.global))
  const conGlobal = dias.map(d => objetivo(null, d.global))

  // El motor viejo: el objetivo se multiplicaba por 1,66 de un día para otro.
  assert.ok(
    Math.max(...conGlobal) / Math.min(...conGlobal) > 1.6,
    `el ancla global era así de inestable: ${conGlobal.join(' → ')}`,
  )
  // El motor nuevo: como mucho un 1% entre el máximo y el mínimo de la semana.
  assert.ok(
    Math.max(...conMes) / Math.min(...conMes) <= 1.01,
    `el bucket del mes debe mantener el objetivo quieto, y dio ${conMes.join(' → ')}`,
  )
})
