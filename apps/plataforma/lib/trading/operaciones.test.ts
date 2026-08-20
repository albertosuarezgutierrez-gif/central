import test from 'node:test'
import assert from 'node:assert/strict'
import { normalizarOperaciones } from './operaciones.ts'

const base = {
  tradeId: '0001ca29.6a828e7a.01.01',
  simbolo: 'VWCE',
  lado: 'BUY',
  cantidad: 188,
  precio: 169.36,
  divisa: 'EUR',
  ejecutadoEn: '2026-08-17T05:30:08Z',
}

test('normaliza una ejecución completa', () => {
  const { operaciones, descartadas } = normalizarOperaciones([{ ...base, comision: 15.91984, pnlBroker: 0, tipoOrden: 'LIMIT' }])
  assert.equal(descartadas.length, 0)
  assert.equal(operaciones.length, 1)
  const o = operaciones[0]
  assert.equal(o.tradeId, base.tradeId)
  assert.equal(o.simbolo, 'VWCE')
  assert.equal(o.lado, 'BUY')
  assert.equal(o.cantidad, 188)
  assert.equal(o.comision, 15.91984)
  assert.equal(o.tipoOrden, 'LIMIT')
  assert.equal(o.ejecutadoEn.toISOString(), '2026-08-17T05:30:08.000Z')
})

test('el tradeId es obligatorio: sin él no hay idempotencia posible', () => {
  const { operaciones, descartadas } = normalizarOperaciones([{ ...base, tradeId: '  ' }])
  assert.equal(operaciones.length, 0)
  assert.match(descartadas[0], /tradeId/)
})

test('descarta lo que no se puede leer en vez de inventarlo', () => {
  const { operaciones, descartadas } = normalizarOperaciones([
    { ...base, tradeId: 'a', cantidad: 0 },
    { ...base, tradeId: 'b', cantidad: 'no-es-un-numero' },
    { ...base, tradeId: 'c', precio: -1 },
    { ...base, tradeId: 'd', lado: 'HOLD' },
    { ...base, tradeId: 'e', ejecutadoEn: 'ayer por la tarde' },
    { ...base, tradeId: 'f', simbolo: '' },
  ])
  assert.equal(operaciones.length, 0)
  assert.equal(descartadas.length, 6)
})

test('un tradeId repetido en el mismo envío se descarta una sola vez', () => {
  const { operaciones, descartadas } = normalizarOperaciones([base, { ...base, precio: 999 }])
  assert.equal(operaciones.length, 1)
  assert.equal(operaciones[0].precio, 169.36)
  assert.match(descartadas[0], /duplicad/)
})

// 🚨 Regla del repo: NULL = «no se ha mirado», nunca 1. Un tipo de cambio inventado convierte
// importes en dólares en euros falsos, y el hueco es lo único que delata que falta el dato.
test('tipoCambio: 1 solo para EUR, null para el resto', () => {
  const { operaciones } = normalizarOperaciones([
    { ...base, tradeId: 'eur', divisa: 'EUR' },
    { ...base, tradeId: 'usd', divisa: 'USD' },
  ])
  assert.equal(operaciones.find(o => o.tradeId === 'eur')?.tipoCambio, 1)
  assert.equal(operaciones.find(o => o.tradeId === 'usd')?.tipoCambio, null)
})

// Un 0 que llega del bróker en una compra SÍ es un dato («esta operación no realizó resultado»).
// Un campo ausente NO lo es. Colapsar los dos al mismo valor borra la diferencia.
test('pnlBroker distingue el 0 real del campo ausente', () => {
  const { operaciones } = normalizarOperaciones([
    { ...base, tradeId: 'con-cero', pnlBroker: 0 },
    { ...base, tradeId: 'sin-campo' },
    { ...base, tradeId: 'ilegible', pnlBroker: 'n/d' },
  ])
  assert.equal(operaciones.find(o => o.tradeId === 'con-cero')?.pnlBroker, 0)
  assert.equal(operaciones.find(o => o.tradeId === 'sin-campo')?.pnlBroker, null)
  assert.equal(operaciones.find(o => o.tradeId === 'ilegible')?.pnlBroker, null)
})

test('la comisión ausente es 0: no pagarla es un hecho, no una incógnita', () => {
  const { operaciones } = normalizarOperaciones([base])
  assert.equal(operaciones[0].comision, 0)
})

test('normaliza símbolo, lado y divisa a mayúsculas y sin espacios', () => {
  const { operaciones } = normalizarOperaciones([{ ...base, simbolo: ' vwce ', lado: 'buy', divisa: ' eur ' }])
  assert.equal(operaciones[0].simbolo, 'VWCE')
  assert.equal(operaciones[0].lado, 'BUY')
  assert.equal(operaciones[0].divisa, 'EUR')
})

test('acepta cantidades fraccionarias (cambio de divisa)', () => {
  const { operaciones, descartadas } = normalizarOperaciones([
    { ...base, tradeId: 'fx', simbolo: 'EUR.USD', tipoActivo: 'CASH', cantidad: 14995.8, precio: 1.1595, divisa: 'USD' },
  ])
  assert.equal(descartadas.length, 0)
  assert.equal(operaciones[0].cantidad, 14995.8)
  assert.equal(operaciones[0].tipoActivo, 'CASH')
})

test('un payload que no es array no revienta', () => {
  const { operaciones, descartadas } = normalizarOperaciones({ operaciones: [] })
  assert.equal(operaciones.length, 0)
  assert.equal(descartadas.length, 1)
})
