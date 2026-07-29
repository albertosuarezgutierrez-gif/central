import { test } from 'node:test'
import assert from 'node:assert/strict'
import { planTesoreria, DIAS_RETENCION_DEPOSITO } from '../src/tesoreria.ts'

const HOY = '2026-07-28'

test('sin compromisos: plan vacío, sin déficit', () => {
  const p = planTesoreria([], HOY, 10000)
  assert.equal(p.total, 0)
  assert.equal(p.pico, 0)
  assert.equal(p.picoDesde, null)
  assert.deepEqual(p.tramos, [])
})

test('subastas SOLAPADAS: el pico es la suma (los dos depósitos coinciden)', () => {
  const p = planTesoreria(
    [
      { dedupeKey: 'a', etiqueta: 'A', deposito: 10000, fechaFin: '2026-08-10T18:00:00Z' },
      { dedupeKey: 'b', etiqueta: 'B', deposito: 5000, fechaFin: '2026-08-13T18:00:00Z' },
    ],
    HOY,
  )
  assert.equal(p.total, 15000)
  assert.equal(p.pico, 15000)
  assert.equal(p.picoDesde, HOY)
  assert.deepEqual(p.picoSubastas.sort(), ['A', 'B'])
})

test('subastas SEPARADAS en el tiempo: el mismo dinero sirve dos veces', () => {
  const p = planTesoreria(
    [
      { dedupeKey: 'a', etiqueta: 'A', deposito: 10000, fechaFin: '2026-08-10T18:00:00Z' },
      // Abre mucho después de que se libere el depósito de A.
      { dedupeKey: 'b', etiqueta: 'B', deposito: 12000, fechaInicio: '2026-10-01', fechaFin: '2026-10-30' },
    ],
    HOY,
  )
  assert.equal(p.total, 22000)
  // Nunca coinciden: basta con tener 12.000, no 22.000.
  assert.equal(p.pico, 12000)
  assert.deepEqual(p.picoSubastas, ['B'])
  assert.equal(p.tramos.length, 2)
})

test('déficit contra el saldo real', () => {
  const c = [{ dedupeKey: 'a', etiqueta: 'A', deposito: 36960.52, fechaFin: '2026-08-13T18:00:00Z' }]
  assert.equal(planTesoreria(c, HOY, 55318.97).deficit, 0)
  assert.equal(planTesoreria(c, HOY, 20000).deficit, 16960.52)
  // Sin saldo conocido NO se inventa un déficit.
  assert.equal(planTesoreria(c, HOY, null).deficit, null)
})

test('sin fecha de cierre o sin depósito: se declara incompleto, no se estima', () => {
  const p = planTesoreria(
    [
      { dedupeKey: 'a', etiqueta: 'sin cierre', deposito: 5000, fechaFin: null },
      { dedupeKey: 'b', etiqueta: 'sin depósito', deposito: 0, fechaFin: '2026-08-10' },
    ],
    HOY,
  )
  assert.equal(p.pico, 0)
  assert.deepEqual(p.incompletos.sort(), ['sin cierre', 'sin depósito'])
})

test('una subasta ya cerrada y devuelta no bloquea nada', () => {
  const p = planTesoreria(
    [{ dedupeKey: 'a', etiqueta: 'vieja', deposito: 5000, fechaFin: '2026-06-01' }],
    HOY,
  )
  assert.equal(p.pico, 0)
  assert.deepEqual(p.incompletos, ['vieja'])
})

test('el depósito sigue bloqueado durante la retención posterior al cierre', () => {
  const p = planTesoreria(
    [{ dedupeKey: 'a', etiqueta: 'A', deposito: 5000, fechaFin: '2026-07-29T18:00:00Z' }],
    HOY,
    null,
    DIAS_RETENCION_DEPOSITO,
  )
  // Cierra mañana pero el dinero no vuelve hasta 15 días después.
  assert.equal(p.tramos[0].hasta, '2026-08-13')
})

test('caso REAL: las 4 subastas del corpus contra el saldo real de Alberto', () => {
  // Datos reales (BD, 28/07/2026): depósitos publicados por el Portal del BOE.
  const p = planTesoreria(
    [
      { dedupeKey: 'SUB-JA-2026-264154', etiqueta: 'El Puerto', deposito: 13760.3, fechaFin: '2026-08-03T18:00:00Z' },
      { dedupeKey: 'SUB-JA-2026-264062', etiqueta: 'Dos Hermanas', deposito: 36960.52, fechaFin: '2026-08-13T18:00:00Z' },
      { dedupeKey: 'SUB-JA-2026-264600', etiqueta: 'Punta Umbría', deposito: 21040, fechaFin: '2026-08-10T18:00:00Z' },
      { dedupeKey: 'SUB-JA-2026-264269', etiqueta: 'Belmonte', deposito: 966.45, fechaFin: '2026-08-10T18:00:00Z' },
    ],
    HOY,
    // BBVA 19.683,33 + Kutxabank 15.202,02 + BBVA 20.433,62
    55318.97,
  )
  assert.equal(p.total, 72727.27)
  // Todas se solapan en agosto: hacen falta las cuatro a la vez.
  assert.equal(p.pico, 72727.27)
  assert.equal(p.deficit, 17408.3)
})
