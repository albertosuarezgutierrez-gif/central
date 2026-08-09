import { test } from 'node:test'
import assert from 'node:assert/strict'
import { elegirBucket, FUENTES_FIABLES_BUCKET } from './pricing-bucket-fuente.ts'

type Pctl = { med: number; flo: number; cei: number }
const p = (med: number): Pctl => ({ med, flo: med - 20, cei: med + 20 })

test('serper NUNCA cuenta como fuente fiable del bucket', () => {
  assert.deepEqual([...FUENTES_FIABLES_BUCKET], ['booking_mcp', 'manual'])
  assert.ok(!FUENTES_FIABLES_BUCKET.includes('serper' as never))
})

test('el fiable manda cuando por sí mismo pasa el umbral', () => {
  // Caso real 09/08/2026: house_sevillana octubre, mezcla 638 contra fiable 728.
  const r = elegirBucket(
    { valores: p(728), n: 30, fechas: 3 },
    { valores: p(638), n: 47, fechas: 3 },
    3, 3,
  )
  assert.equal(r!.fuente, 'fiable')
  assert.equal(r!.valores.med, 728, 'octubre deja de estar hundido por los precios de anuncio')
  assert.equal(r!.n, 30, 'la muestra que se reporta es la del corpus elegido, no la de la mezcla')
})

test('sin fechas suficientes en el fiable se cae a la MEZCLA, no al vacío', () => {
  // Caso real: busto_reform octubre — el fiable solo tiene 2 fechas.
  const r = elegirBucket(
    { valores: p(184), n: 20, fechas: 2 },
    { valores: p(160), n: 48, fechas: 3 },
    3, 3,
  )
  assert.equal(r!.fuente, 'mixto')
  assert.equal(r!.valores.med, 160, 'exactamente el comportamiento anterior al cambio')
})

test('sin muestra suficiente en el fiable también cae a la mezcla', () => {
  const r = elegirBucket({ valores: p(200), n: 2, fechas: 5 }, { valores: p(150), n: 40, fechas: 5 }, 3, 3)
  assert.equal(r!.fuente, 'mixto')
})

test('🚨 la preferencia NUNCA deja un bucket sin datos', () => {
  // Es la garantía que hace el cambio seguro: el peor caso es la mezcla de ayer.
  const sinFiable = elegirBucket({ valores: null, n: 0, fechas: 0 }, { valores: p(120), n: 30, fechas: 4 }, 3, 3)
  assert.equal(sinFiable!.fuente, 'mixto')
  assert.equal(sinFiable!.valores.med, 120)
})

test('si NO hay ni mezcla, devuelve null (el motor cae al ancla global, como antes)', () => {
  assert.equal(elegirBucket({ valores: null, n: 0, fechas: 0 }, { valores: null, n: 0, fechas: 0 }, 3, 3), null)
})

test('la elegibilidad del mes no puede EMPEORAR por elegir el fiable', () => {
  // Si el fiable gana es porque ya cumple minN/minFechas, así que el gate posterior del motor
  // (`n >= MIN_BUCKET && fechas >= MIN_FECHAS_MES`) sigue pasando con los valores elegidos.
  for (const [nF, fF] of [[3, 3], [10, 4], [50, 5]] as const) {
    const r = elegirBucket({ valores: p(100), n: nF, fechas: fF }, { valores: p(90), n: 99, fechas: 9 }, 3, 3)!
    assert.equal(r.fuente, 'fiable')
    assert.ok(r.n >= 3 && r.fechas >= 3, 'lo elegido siempre supera el umbral que exige el motor')
  }
})

test('el bucket por FECHA exacta no exige fechas distintas (todas son del mismo día)', () => {
  const r = elegirBucket({ valores: p(300), n: 3, fechas: 1 }, { valores: p(250), n: 12, fechas: 1 }, 3)
  assert.equal(r!.fuente, 'fiable')
  assert.equal(r!.valores.med, 300)
})
