import { test } from 'node:test'
import assert from 'node:assert/strict'
import { agregarInsiders, type TxInsider } from '../src/insiders.ts'

test('agregarInsiders premia el CLUSTER BUY (varios insiders distintos comprando)', () => {
  const txs: TxInsider[] = [
    { simbolo: 'ACME', insider: 'CEO Ana', tipo: 'compra', acciones: 1000, precioUsd: 10 },
    { simbolo: 'ACME', insider: 'CFO Bea', tipo: 'compra', acciones: 500, precioUsd: 10 },
    { simbolo: 'ACME', insider: 'Dir Caro', tipo: 'compra', acciones: 200, precioUsd: 10 },
    { simbolo: 'FOO', insider: 'CEO Dan', tipo: 'venta', acciones: 300, precioUsd: 20 },
  ]
  const r = agregarInsiders(txs)
  assert.equal(r[0].simbolo, 'ACME')       // 3 compradores distintos → arriba
  assert.equal(r[0].compradores, 3)
  assert.equal(r[0].vendedores, 0)
  assert.equal(r[0].netoUsd, 17000)        // (1000+500+200)*10
  assert.equal(r[0].score, 3)
  const foo = r.find(x => x.simbolo === 'FOO')!
  assert.equal(foo.score, -1)
  assert.equal(foo.netoUsd, -6000)
})

test('agregarInsiders cuenta insiders DISTINTOS (mismo insider compra 2x = 1 comprador) pero suma el neto', () => {
  const txs: TxInsider[] = [
    { simbolo: 'X', insider: 'CEO Ana', tipo: 'compra', acciones: 100, precioUsd: 5 },
    { simbolo: 'X', insider: 'CEO Ana', tipo: 'compra', acciones: 100, precioUsd: 5 },
  ]
  const r = agregarInsiders(txs)
  assert.equal(r[0].compradores, 1)        // una sola persona
  assert.equal(r[0].netoUsd, 1000)         // pero su dinero suma dos veces
  assert.equal(r[0].score, 1)
})

test('agregarInsiders sin precio → neto 0, y descarta transacciones inválidas', () => {
  const txs: TxInsider[] = [
    { simbolo: 'Y', insider: 'Dir Eva', tipo: 'compra', acciones: 40 },   // sin precio
    { simbolo: 'Y', insider: 'Dir Leo', tipo: 'compra', acciones: 0, precioUsd: 9 }, // acciones 0 → descartada
    { simbolo: '', insider: 'Dir Sin', tipo: 'compra', acciones: 10, precioUsd: 9 }, // sin símbolo → descartada
  ]
  const r = agregarInsiders(txs)
  assert.equal(r.length, 1)
  assert.equal(r[0].simbolo, 'Y')
  assert.equal(r[0].compradores, 1)        // solo Eva (Leo descartado por acciones 0)
  assert.equal(r[0].netoUsd, 0)
})

test('agregarInsiders devuelve [] con lista vacía', () => {
  assert.deepEqual(agregarInsiders([]), [])
})
