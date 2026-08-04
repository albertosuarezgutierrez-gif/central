// node --test --experimental-strip-types lib/vigilantes-tarjeta.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { esCargoFinanciero, dobleCobro, subioPrecio, type MovVig } from './vigilantes-tarjeta.ts'

test('esCargoFinanciero reconoce intereses/comisiones/aplazamiento', () => {
  assert.equal(esCargoFinanciero('INTERESES POR APLAZAMIENTO'), true)
  assert.equal(esCargoFinanciero('COMISION MANTENIMIENTO TARJETA'), true)
  assert.equal(esCargoFinanciero('CUOTA FINANCIACION'), true)
  assert.equal(esCargoFinanciero('COMPRA EN MERCADONA'), false)
  assert.equal(esCargoFinanciero(null), false)
})

test('dobleCobro agrupa cargos idénticos repetidos', () => {
  const movs: MovVig[] = [
    { id: 'a', comercio: 'CLUB MERCANTIL', importe: -35 },
    { id: 'b', comercio: 'CLUB MERCANTIL', importe: -35 },
    { id: 'c', comercio: 'MERCADONA', importe: -12.4 },
    { id: 'd', comercio: 'CLUB MERCANTIL', importe: -40 }, // otro importe → no agrupa con a/b
  ]
  const dobles = dobleCobro(movs)
  assert.equal(dobles.length, 1)
  assert.equal(dobles[0].comercio, 'CLUB MERCANTIL')
  assert.equal(dobles[0].importe, 35)
  assert.deepEqual(dobles[0].ids.sort(), ['a', 'b'])
})

test('dobleCobro ignora comercios vacíos y no repetidos', () => {
  assert.deepEqual(dobleCobro([{ id: 'x', comercio: '', importe: -10 }, { id: 'y', comercio: 'DIA', importe: -3 }]), [])
})

test('subioPrecio detecta la subida por encima del umbral', () => {
  assert.equal(subioPrecio(9.99, 6.99), true)     // +43%
  assert.equal(subioPrecio(7.5, 6.99), false)     // +7% < 15%
  assert.equal(subioPrecio(-9.99, -6.99), true)   // usa valor absoluto (cargos negativos)
  assert.equal(subioPrecio(9.99, 0), false)       // sin previo válido
})
