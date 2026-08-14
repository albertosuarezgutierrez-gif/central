// node --test --experimental-strip-types lib/vigilantes-tarjeta.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { esCargoFinanciero, dobleCobro, subioPrecio, baseRecurrente, type MovVig } from './vigilantes-tarjeta.ts'

test('esCargoFinanciero reconoce intereses/comisiones/aplazamiento', () => {
  assert.equal(esCargoFinanciero('INTERESES POR APLAZAMIENTO'), true)
  assert.equal(esCargoFinanciero('COMISION MANTENIMIENTO TARJETA'), true)
  assert.equal(esCargoFinanciero('CUOTA FINANCIACION'), true)
  assert.equal(esCargoFinanciero('COMPRA EN MERCADONA'), false)
  assert.equal(esCargoFinanciero(null), false)
})

test('dobleCobro agrupa cargos idénticos del MISMO día', () => {
  const movs: MovVig[] = [
    { id: 'a', comercio: 'CLUB MERCANTIL', importe: -35, fecha: '2026-07-03' },
    { id: 'b', comercio: 'CLUB MERCANTIL', importe: -35, fecha: '2026-07-03' },
    { id: 'c', comercio: 'MERCADONA', importe: -12.4, fecha: '2026-07-03' },
    { id: 'd', comercio: 'CLUB MERCANTIL', importe: -40, fecha: '2026-07-03' }, // otro importe
  ]
  const dobles = dobleCobro(movs)
  assert.equal(dobles.length, 1)
  assert.equal(dobles[0].comercio, 'CLUB MERCANTIL')
  assert.equal(dobles[0].importe, 35)
  assert.equal(dobles[0].fecha, '2026-07-03')
  assert.deepEqual(dobles[0].ids.sort(), ['a', 'b'])
})

// El fallo real que veía Alberto: repostar 40,00€ dos veces en el mes NO es un cobro doble.
test('dobleCobro NO avisa si el mismo importe cae en días distintos', () => {
  assert.deepEqual(dobleCobro([
    { id: 'a', comercio: 'GASOLINERAS ISBILYA', importe: -40, fecha: '2026-07-04' },
    { id: 'b', comercio: 'GASOLINERAS ISBILYA', importe: -40, fecha: '2026-07-21' },
  ]), [])
})

// 2× 0,99€ en el súper el mismo día son dos compras, no un duplicado del banco.
test('dobleCobro ignora los importes pequeños, los comercios vacíos y los cargos sin fecha', () => {
  assert.deepEqual(dobleCobro([
    { id: 'a', comercio: 'DIA SEVILLA 2260', importe: -0.99, fecha: '2026-07-05' },
    { id: 'b', comercio: 'DIA SEVILLA 2260', importe: -0.99, fecha: '2026-07-05' },
  ]), [])
  assert.deepEqual(dobleCobro([
    { id: 'x', comercio: '', importe: -30, fecha: '2026-07-05' },
    { id: 'y', comercio: '', importe: -30, fecha: '2026-07-05' },
  ]), [])
  assert.deepEqual(dobleCobro([
    { id: 'x', comercio: 'ALGO', importe: -30 },
    { id: 'y', comercio: 'ALGO', importe: -30 },
  ]), [])
})

// Dos sucursales de la misma cadena el mismo día por el mismo importe SÍ son sospechosas.
test('dobleCobro casa por identidad de comercio, no por el rótulo literal', () => {
  const dobles = dobleCobro([
    { id: 'a', comercio: 'DIA SEVILLA 2260', importe: -32.5, fecha: '2026-07-05' },
    { id: 'b', comercio: 'DIA SEVILLA 3417', importe: -32.5, fecha: '2026-07-05' },
  ])
  assert.equal(dobles.length, 1)
  assert.deepEqual(dobles[0].ids.sort(), ['a', 'b'])
})

test('subioPrecio detecta la subida por encima del umbral', () => {
  assert.equal(subioPrecio(9.99, 6.99), true)     // +43%
  assert.equal(subioPrecio(7.5, 6.99), false)     // +7% < 15%
  assert.equal(subioPrecio(-9.99, -6.99), true)   // usa valor absoluto (cargos negativos)
  assert.equal(subioPrecio(9.99, 0), false)       // sin previo válido
})

test('baseRecurrente da precio de referencia de una suscripción estable', () => {
  const base = baseRecurrente([
    { importe: 6.99, fecha: '2026-04-10' },
    { importe: 6.99, fecha: '2026-05-10' },
    { importe: 6.99, fecha: '2026-06-10' },
  ])
  assert.equal(base, 6.99)
  assert.equal(subioPrecio(9.99, base as number), true)
})

// El ruido que denunció Alberto: DIA 3,25€ → 7,52€ o un restaurante 33€ → 87€ NO son subidas de
// precio; son tickets distintos de un comercio de importe variable. Sin precio de referencia, se calla.
test('baseRecurrente devuelve null si el comercio es de importe variable', () => {
  assert.equal(baseRecurrente([
    { importe: 3.25, fecha: '2026-04-02' },
    { importe: 41.10, fecha: '2026-05-09' },
    { importe: 12.80, fecha: '2026-06-21' },
  ]), null)
})

test('baseRecurrente exige historial: pocos cargos o pocos meses → null', () => {
  assert.equal(baseRecurrente([{ importe: 6.99, fecha: '2026-06-10' }]), null)
  assert.equal(baseRecurrente([
    { importe: 6.99, fecha: '2026-06-01' },
    { importe: 6.99, fecha: '2026-06-12' },
    { importe: 6.99, fecha: '2026-06-25' },
  ]), null)   // 3 cargos pero un solo mes: es una racha, no un recurrente
  assert.equal(baseRecurrente([]), null)
})
