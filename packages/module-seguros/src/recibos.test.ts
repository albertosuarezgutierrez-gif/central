import test from 'node:test'
import assert from 'node:assert/strict'
import { estadoCobro, explicarCobro, resumirRecibos, type ReciboCrudo } from './recibos.ts'

function recibo(situacion: string | null, primaTotal: string | null = '100.00'): ReciboCrudo {
  return { id: `r-${situacion}-${primaTotal}`, situacion, primaTotal, fechaEmision: '2026-06-01', fechaVencimiento: null, formaPago: null }
}

test('🚨 sin recibos NO es «al corriente»: es que no se sabe', () => {
  const r = resumirRecibos([])
  assert.equal(r.total, 0)
  assert.equal(estadoCobro(r), 'sin_datos')
  assert.match(explicarCobro(r), /no se sabe/)
  // Y muy concretamente: NO puede decir que está pagada.
  assert.doesNotMatch(explicarCobro(r), /al corriente|ninguno pendiente/)
})

test('el cobrado suma solo los cobrados, y anulado no cuenta en ningún lado', () => {
  const r = resumirRecibos([
    recibo('cobrado', '431.85'),
    recibo('cobrado', '100.15'),
    recibo('anulado', '999.99'),
    recibo('pendiente', '50.00'),
  ])
  assert.equal(r.cobrados, 2)
  assert.equal(r.anulados, 1)
  assert.equal(r.pendientes, 1)
  assert.equal(r.cobradoEur, 532)
  assert.equal(estadoCobro(r), 'pendiente')
})

test('un devuelto manda sobre un pendiente: es lo que hay que reclamar ya', () => {
  const r = resumirRecibos([recibo('devuelto'), recibo('pendiente'), recibo('cobrado')])
  assert.equal(estadoCobro(r), 'devuelto')
  assert.match(explicarCobro(r), /devuelto/)
})

test('al corriente solo cuando hay recibos Y ninguno pendiente ni devuelto', () => {
  const r = resumirRecibos([recibo('cobrado'), recibo('anulado')])
  assert.equal(estadoCobro(r), 'al_corriente')
})

test('🚨 importes ilegibles se cuentan aparte, no como 0€', () => {
  const r = resumirRecibos([recibo('cobrado', '1.234,56'), recibo('cobrado', '10.00')])
  assert.equal(r.cobrados, 2)
  assert.equal(r.cobradoEur, 10)
  assert.equal(r.ilegibles, 1, 'el importe en formato español debe delatarse, no sumar 0')
})

test('si NINGÚN importe se puede leer, el total es null y no 0,00€', () => {
  const r = resumirRecibos([recibo('cobrado', 'N/A'), recibo('cobrado', '')])
  assert.equal(r.cobrados, 2)
  assert.equal(r.cobradoEur, null)
})

test('el último recibo es el primero de la lista, y su situación ausente se dice', () => {
  const r = resumirRecibos([recibo(null, '20.00'), recibo('cobrado')])
  assert.equal(r.ultimo?.situacion, 'sin_informar')
  assert.equal(r.ultimo?.importe, 20)
  // Un recibo sin situación no se cuenta como cobrado ni como pendiente.
  assert.equal(r.cobrados, 1)
  assert.equal(r.pendientes, 0)
})

test('impagado cuenta como devuelto (es la misma realidad con otro nombre)', () => {
  assert.equal(estadoCobro(resumirRecibos([recibo('impagado')])), 'devuelto')
  assert.equal(estadoCobro(resumirRecibos([recibo('emitido')])), 'pendiente')
})

test('🚨 todos los recibos anulados NO es «al corriente»', () => {
  const r = resumirRecibos([
    { id: 'a', situacion: 'anulado', primaTotal: '100.00', fechaEmision: '2026-01-01', fechaVencimiento: null, formaPago: null },
    { id: 'b', situacion: 'anulado', primaTotal: '100.00', fechaEmision: '2025-07-01', fechaVencimiento: null, formaPago: null },
  ])
  assert.equal(estadoCobro(r), 'anulados')
  assert.match(explicarCobro(r), /anulados/)
})
