import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  cortePrevio, regimenDeMes, atribucionMotor, compararAnual, totalizar,
  type FilaMesPiso,
} from './rentabilidad-anual.ts'

test('el corte del año anterior es el MISMO día del calendario', () => {
  assert.equal(cortePrevio('2026-08-26'), '2025-08-26')
  assert.equal(cortePrevio('2026-01-01'), '2025-01-01')
})

test('el 29 de febrero se recorta al 28 (el año anterior no lo tiene)', () => {
  // Sin esto la comparación de un bisiesto lanzaría una fecha inexistente.
  assert.equal(cortePrevio('2028-02-29'), '2027-02-28')
})

test('los tres regímenes salen de dónde cae hoy', () => {
  const hoy = '2026-08-26'
  assert.equal(regimenDeMes('2026-03', hoy), 'cerrado')
  assert.equal(regimenDeMes('2026-08', hoy), 'en_curso')
  assert.equal(regimenDeMes('2026-12', hoy), 'cartera')
})

test('el mes del go-live es PARCIAL, nunca «sí»', () => {
  // House arrancó el 09/08/2026: agosto es mixto (8 días sin motor). Marcarlo como 'si'
  // atribuiría al motor lo que vendió la política anterior.
  const gl = '2026-08-09'
  assert.equal(atribucionMotor('2026-07', gl), 'no')
  assert.equal(atribucionMotor('2026-08', gl), 'parcial')
  assert.equal(atribucionMotor('2026-09', gl), 'si')
})

test('un piso sin go-live conocido nunca se atribuye al motor', () => {
  assert.equal(atribucionMotor('2026-09', undefined), 'no')
})

test('empareja mes contra mes y calcula el delta', () => {
  const filas: FilaMesPiso[] = [
    { property_id: 'p1', mes: '2026-03', bruto: 1200, noches: 10, reservas: 4 },
    { property_id: 'p1', mes: '2025-03', bruto: 1000, noches: 12, reservas: 5 },
  ]
  const serie = compararAnual(filas, { hoyISO: '2026-08-26', goLive: { p1: '2026-06-10' }, pisos: ['p1'] })
  const marzo = serie.find((s) => s.mesNum === 3)!
  assert.equal(marzo.actual.bruto, 1200)
  assert.equal(marzo.previo.bruto, 1000)
  assert.equal(marzo.deltaEur, 200)
  assert.equal(marzo.deltaPct, 20)
  assert.equal(marzo.atribucion, 'no') // marzo es anterior al go-live de junio
})

test('un mes sin dato del año anterior NO inventa un porcentaje', () => {
  // Un % sobre cero no significa nada; `null` dice «no comparable», que es la verdad.
  const filas: FilaMesPiso[] = [{ property_id: 'p1', mes: '2026-11', bruto: 800, noches: 4, reservas: 2 }]
  const serie = compararAnual(filas, { hoyISO: '2026-08-26', goLive: {}, pisos: ['p1'] })
  const nov = serie.find((s) => s.mesNum === 11)!
  assert.equal(nov.deltaEur, 800)
  assert.equal(nov.deltaPct, null)
  assert.deepEqual(nov.previo, { bruto: 0, noches: 0, reservas: 0 })
})

test('la serie cubre los 12 meses aunque no haya ventas', () => {
  const serie = compararAnual([], { hoyISO: '2026-08-26', goLive: {}, pisos: ['p1', 'p2'] })
  assert.equal(serie.length, 24)
  assert.ok(serie.every((s) => s.actual.bruto === 0 && s.previo.bruto === 0))
})

test('regresión: los datos REALES del grupo a 26/08/2026 cuadran con lo medido en BD', () => {
  // Cifras reales consultadas contra producción el 26/08/2026 (1 ene → 26 ago, consumido):
  //   2025: 98.883€ · 455 noches   |   2026: 97.882€ · 511 noches
  // El titular NO es el bruto (casi empate): es que se venden 56 noches MÁS para ingresar algo
  // MENOS — el precio medio por noche cae de 217€ a 192€. Este test fija esa lectura.
  const filas: FilaMesPiso[] = [
    { property_id: 'g', mes: '2025-01', bruto: 98883, noches: 455, reservas: 140 },
    { property_id: 'g', mes: '2026-01', bruto: 97882, noches: 511, reservas: 149 },
  ]
  const serie = compararAnual(filas, { hoyISO: '2026-08-26', goLive: {}, pisos: ['g'] })
  const t = totalizar(serie)
  assert.equal(t.actual.bruto, 97882)
  assert.equal(t.previo.bruto, 98883)
  assert.equal(t.deltaEur, -1001)
  assert.equal(t.deltaPct, -1)
  const adrActual = Math.round(t.actual.bruto / t.actual.noches)
  const adrPrevio = Math.round(t.previo.bruto / t.previo.noches)
  assert.equal(adrPrevio, 217)
  assert.equal(adrActual, 192)
  assert.ok(adrActual < adrPrevio, 'más noches por menos dinero: el ADR baja')
})
