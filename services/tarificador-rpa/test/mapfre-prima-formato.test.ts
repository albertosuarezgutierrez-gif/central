// Mapfre auto 0.8.5 (trabajo real 815f6675, 15/10/2026): en «Coberturas» con primas visibles el bot atascaba porque el lector
// exigía 2 decimales («670,1 €») y que TODAS las tarjetas tuvieran prima (TODO RIESGO sale bloqueada por controles técnicos).
// Fixtures SINTÉTICOS: ningún dato personal.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { firmaTarjetas, importeDePrimaTotal, primasDesdeTarjetas, tarjetasListasParaLeer, type TarjetaProductoLeida } from '../src/adapters/mapfre/auto.ts'

const tarjeta = (producto: string, textoPrima: string, textoTarjeta = ''): TarjetaProductoLeida => ({
  producto, periodicidad: 'ANUAL', textoPrima, avisoVerificacion: false, textoTarjeta,
})
const BLOQUEO = 'Existen controles técnicos que impiden tarificar este producto'

test('importeDePrimaTotal acepta 0, 1 o 2 decimales y miles', () => {
  assert.equal(importeDePrimaTotal('PRIMA TOTAL: 670,1 €'), 670.1)
  assert.equal(importeDePrimaTotal('PRIMA TOTAL: 392,02 €'), 392.02)
  assert.equal(importeDePrimaTotal('PRIMA TOTAL: 1.234 €'), 1234)
  assert.equal(importeDePrimaTotal('PRIMA TOTAL: 1.234,5 €'), 1234.5)
  assert.equal(importeDePrimaTotal('PRIMA TOTAL: 450 €'), 450)
  assert.equal(importeDePrimaTotal('PRIMA TOTAL: 1,234,5 €'), null)
  assert.equal(importeDePrimaTotal('PRIMA TOTAL: 12,345 €'), null)
})

test('tarjeta bloqueada por controles técnicos + otras con precio: devuelve las de precio', () => {
  const tarjetas = [
    tarjeta('TERCEROS', 'PRIMA TOTAL: 392,02 €'),
    tarjeta('TERCEROS AMPLIADO', 'PRIMA TOTAL: 670,1 €'),
    tarjeta('TODO RIESGO', '', `TODO RIESGO warning ${BLOQUEO}`),
  ]
  assert.equal(tarjetasListasParaLeer(tarjetas), true)
  const primas = primasDesdeTarjetas(tarjetas)
  assert.deepEqual(primas.map((p) => [p.producto, p.primaTotalEur]), [['TERCEROS', 392.02], ['TERCEROS AMPLIADO', 670.1]])
})

test('la prima se lee del texto de la tarjeta si la caja de prima no casa', () => {
  const primas = primasDesdeTarjetas([tarjeta('TERCEROS', '', 'TERCEROS ANUAL PRIMA TOTAL: 392,02 € Contratar')])
  assert.equal(primas[0]!.primaTotalEur, 392.02)
})

test('sin ninguna prima (todas bloqueadas) o con una tarjeta aún sin calcular: no se lee (atasco como antes)', () => {
  assert.equal(tarjetasListasParaLeer([tarjeta('TODO RIESGO', '', BLOQUEO)]), false)
  assert.throws(() => primasDesdeTarjetas([tarjeta('TODO RIESGO', '', BLOQUEO)]), /bloqueados por controles/)
  const calculando = [tarjeta('TERCEROS', 'PRIMA TOTAL: 392,02 €'), tarjeta('TERCEROS AMPLIADO', 'PRIMA TOTAL: {{primaTotal}} €')]
  assert.equal(tarjetasListasParaLeer(calculando), false)
  assert.throws(() => primasDesdeTarjetas(calculando), /prima ilegible/)
})

test('firmaTarjetas ignora el textContent crudo: misma prima y distinto textoTarjeta dan la misma firma', () => {
  const lectura1 = [tarjeta('TERCEROS', 'PRIMA TOTAL: 392,02 €', 'TERCEROS  392,02 €  ver más')]
  const lectura2 = [tarjeta('TERCEROS', 'PRIMA TOTAL: 392,02 €', 'TERCEROS 392,02 € ver más  (actualizado)')]
  assert.equal(firmaTarjetas(lectura1), firmaTarjetas(lectura2))
  // Y cambiar la prima sí cambia la firma (la estabilidad sigue detectando un precio nuevo).
  const otra = [tarjeta('TERCEROS', 'PRIMA TOTAL: 400,5 €', 'TERCEROS 400,5 €')]
  assert.notEqual(firmaTarjetas(lectura1), firmaTarjetas(otra))
})
