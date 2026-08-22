import { test } from 'node:test'
import assert from 'node:assert/strict'
import { factorAcumulado, ajustarPorSplits, ajustarSimbolo, parseSplits } from '../src/splits.ts'

// Splits REALES de NVDA (Alpha Vantage, consultado el 21/08/2026). NVDA está en el libro.
const NVDA = parseSplits([
  { effective_date: '2024-06-10', split_factor: '10.0000' },
  { effective_date: '2021-07-20', split_factor: '4.0000' },
  { effective_date: '2007-09-11', split_factor: '1.5000' },
])

test('el parser ordena por fecha y descarta lo ilegible o el factor 0', () => {
  const s = parseSplits([
    { effective_date: '2024-06-10', split_factor: '10' },
    { effective_date: 'mañana', split_factor: '2' },
    { effective_date: '2021-07-20', split_factor: '0' },
    { effective_date: '2021-07-20', split_factor: '4' },
  ])
  assert.deepEqual(s, [{ fechaEfectiva: '2021-07-20', factor: 4 }, { fechaEfectiva: '2024-06-10', factor: 10 }])
})

test('el factor acumula TODOS los splits posteriores', () => {
  assert.equal(factorAcumulado('2020-01-01', NVDA), 40, '4:1 en 2021 y 10:1 en 2024')
  assert.equal(factorAcumulado('2022-01-01', NVDA), 10, 'solo queda el de 2024')
  assert.equal(factorAcumulado('2025-01-01', NVDA), 1, 'ya no hay ninguno después')
})

test('una operación DEL día efectivo ya viene en títulos nuevos: no se ajusta', () => {
  assert.equal(factorAcumulado('2024-06-10', NVDA), 1)
  assert.equal(factorAcumulado('2024-06-09', NVDA), 10)
})

test('el ajuste conserva el importe — si cambiara, estaría inventando dinero', () => {
  const op = { fecha: '2024-06-09', cantidad: 100, precio: 1200 }
  const a = ajustarPorSplits(op, NVDA)
  assert.equal(a.cantidad, 1000)
  assert.equal(a.precio, 120)
  assert.equal(a.cantidad * a.precio, op.cantidad * op.precio)
})

test('el caso que rompe el FIFO: compra pre-split y venta post-split ya casan', () => {
  const compra = ajustarPorSplits({ fecha: '2024-06-05', cantidad: 100, precio: 1200 }, NVDA)
  const venta = ajustarPorSplits({ fecha: '2024-07-01', cantidad: 1000, precio: 125 }, NVDA)
  assert.equal(compra.cantidad, venta.cantidad, 'sin ajustar serían 100 contra 1.000')
  assert.equal(venta.cantidad * venta.precio - compra.cantidad * compra.precio, 5000, 'plusvalía real')
})

test('un contrasplit (factor < 1) reduce títulos y sube el precio', () => {
  const a = ajustarPorSplits({ fecha: '2024-01-01', cantidad: 1000, precio: 2 },
    [{ fechaEfectiva: '2024-06-01', factor: 0.1 }])
  assert.equal(a.cantidad, 100)
  assert.equal(a.precio, 20)
  assert.equal(a.cantidad * a.precio, 2000)
})

test('🚨 splits null = SIN REVISAR, que no es «no tiene splits»', () => {
  const ops = [{ fecha: '2024-06-09', cantidad: 100, precio: 1200 }]
  const sinRevisar = ajustarSimbolo(ops, null)
  const revisado = ajustarSimbolo(ops, [])
  assert.equal(sinRevisar.estado, 'sin-revisar')
  assert.equal(revisado.estado, 'revisado-sin-splits')
  assert.notEqual(sinRevisar.estado, revisado.estado, 'colapsarlos haría pasar lo no mirado por limpio')
})

test('sin revisar NO se toca ninguna cantidad: no se finge un ajuste', () => {
  const r = ajustarSimbolo([{ fecha: '2024-06-09', cantidad: 100, precio: 1200 }], null)
  assert.equal(r.operaciones[0].cantidad, 100)
  assert.equal(r.ajustadas, 0)
})

test('un símbolo con splits reporta cuántas filas cambiaron', () => {
  const r = ajustarSimbolo([
    { fecha: '2024-06-09', cantidad: 100, precio: 1200 },   // antes → se ajusta
    { fecha: '2024-06-10', cantidad: 10, precio: 120 },     // el día efectivo → no
    { fecha: '2025-01-01', cantidad: 5, precio: 130 },      // después → no
  ], NVDA)
  assert.equal(r.estado, 'ajustado')
  assert.equal(r.ajustadas, 1)
})
