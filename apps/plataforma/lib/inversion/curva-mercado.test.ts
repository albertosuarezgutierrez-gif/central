import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mediana, preciosPorNoche, construirCurva, type MedicionVentana } from './curva-mercado.ts'

const ventana = (p: Partial<MedicionVentana> = {}): MedicionVentana => ({
  mes: 8,
  aforo: 4,
  noches: 2,
  totalesEstancia: [520, 690, 658],
  universoConocido: null,
  ...p,
})

test('mediana: impar coge el centro, par promedia los dos del medio', () => {
  assert.equal(mediana([3, 1, 2]), 2)
  assert.equal(mediana([1, 2, 3, 4]), 2.5)
})

test('mediana de una lista vacía es null, NO 0', () => {
  // Un 0 aquí diría «el mercado vale cero euros» cuando lo cierto es «no medí».
  assert.equal(mediana([]), null)
})

test('price.book es el TOTAL de la estancia: hay que dividir por noches', () => {
  // Misma trampa que costó el radar de trading: la unidad del dato no es la que
  // sugiere la etiqueta del documento que lo publica.
  assert.deepEqual(preciosPorNoche([520, 690], 2), [260, 345])
  assert.deepEqual(preciosPorNoche([300], 1), [300])
})

test('preciosPorNoche con 0 noches no divide entre cero: devuelve vacío', () => {
  assert.deepEqual(preciosPorNoche([520], 0), [])
})

test('una ventana sin respuesta es «0 comparables» y ADR null, no mercado a 0€', () => {
  const curva = construirCurva([ventana({ mes: 11, totalesEstancia: [] })], 4)
  const nov = curva.find(m => m.mes === 11)!
  assert.equal(nov.comparables, 0)
  assert.equal(nov.adrGuest, null)
})

test('solo entran las ventanas del aforo pedido', () => {
  const curva = construirCurva(
    [ventana({ mes: 8, aforo: 4, totalesEstancia: [520] }), ventana({ mes: 8, aforo: 10, totalesEstancia: [2200] })],
    10,
  )
  assert.equal(curva.length, 1)
  assert.equal(curva[0].adrGuest, 1100)
})

test('acumula varias ventanas del mismo mes antes de sacar la mediana', () => {
  const curva = construirCurva(
    [
      ventana({ mes: 8, totalesEstancia: [200, 400] }),
      ventana({ mes: 8, totalesEstancia: [600, 800] }),
    ],
    4,
  )
  assert.equal(curva[0].comparables, 4)
  // por noche: 100, 200, 300, 400 → mediana 250
  assert.equal(curva[0].adrGuest, 250)
})

test('el proxy de ocupación es null si no se midió el universo de comparables', () => {
  const curva = construirCurva([ventana()], 4)
  assert.equal(curva[0].ocupacionProxy, null)
})

test('con universo conocido, el proxy sale de la saturación (1 - libres/universo)', () => {
  const curva = construirCurva([ventana({ totalesEstancia: [100, 200], universoConocido: 10 })], 4)
  assert.equal(curva[0].ocupacionProxy, 0.8)
})

test('el proxy nunca se sale de [0,1] aunque el universo esté mal medido', () => {
  const curva = construirCurva([ventana({ totalesEstancia: [1, 2, 3], universoConocido: 2 })], 4)
  assert.equal(curva[0].ocupacionProxy, 0)
})

test('los datos REALES de Conil dan la estacionalidad medida el 27/08/2026', () => {
  const curva = construirCurva(
    [
      ventana({ mes: 8, totalesEstancia: [520, 690, 551.04, 658, 711.55, 915.3, 672, 607.37, 720, 588] }),
      ventana({ mes: 11, totalesEstancia: [268, 151.54, 163.2, 180, 260, 154, 188.96, 378.4, 140, 219.6] }),
    ],
    4,
  )
  const ago = curva.find(m => m.mes === 8)!
  const nov = curva.find(m => m.mes === 11)!
  assert.equal(Math.round(ago.adrGuest! * 100) / 100, 332.5)
  assert.equal(Math.round(nov.adrGuest! * 100) / 100, 92.24)
  assert.ok(ago.adrGuest! / nov.adrGuest! > 3.5, 'el pico debe ser >3,5× el valle')
})

test('la curva sale ordenada por mes', () => {
  const curva = construirCurva(
    [ventana({ mes: 11 }), ventana({ mes: 3 }), ventana({ mes: 8 })],
    4,
  )
  assert.deepEqual(curva.map(m => m.mes), [3, 8, 11])
})
