import { test } from 'node:test'
import assert from 'node:assert/strict'
import { elegirCodigoPortal, pinsPorReserva } from './codigo-portal.ts'

test('el PIN de la reserva MANDA sobre el maestro', () => {
  const r = elegirCodigoPortal({ pinReserva: '4821', maestro: '987654#' })
  assert.equal(r.codigo, '4821')
  assert.equal(r.origen, 'reserva')
  assert.match(r.nota, /SOLO vuestro/)
})

test('sin PIN de reserva cae al maestro, y sin nota de caducidad', () => {
  const r = elegirCodigoPortal({ pinReserva: null, maestro: '2022#' })
  assert.equal(r.codigo, '2022#')
  assert.equal(r.origen, 'maestro')
  assert.equal(r.nota, '', 'el maestro NO caduca: prometer que sí sería mentira')
})

test('sin nada, se declara el hueco en vez de inventar un código', () => {
  const r = elegirCodigoPortal({ pinReserva: null, maestro: null })
  assert.equal(r.codigo, null)
  assert.equal(r.origen, 'ninguno')
})

test('un PIN vacío o en blanco no cuenta como PIN', () => {
  assert.equal(elegirCodigoPortal({ pinReserva: '   ', maestro: '2022#' }).origen, 'maestro')
  assert.equal(elegirCodigoPortal({ pinReserva: '', maestro: null }).origen, 'ninguno')
})

test('pinsPorReserva: un PIN vivo por reserva se entrega tal cual', () => {
  const m = pinsPorReserva([{ reservaRef: '152490601', pin: '4821' }])
  assert.equal(m.get('152490601'), '4821')
})

test('pinsPorReserva: dos cerraduras con el MISMO código no son ambiguas', () => {
  const m = pinsPorReserva([
    { reservaRef: '9', pin: '4821' },
    { reservaRef: '9', pin: '4821' },
  ])
  assert.equal(m.get('9'), '4821')
})

test('pinsPorReserva: dos códigos distintos vivos = sin PIN (cae al maestro)', () => {
  const m = pinsPorReserva([
    { reservaRef: '9', pin: '4821' },
    { reservaRef: '9', pin: '7733' },
  ])
  assert.equal(m.has('9'), false, 'con dos códigos no se puede rellenar un solo hueco {PORTAL}')
})

test('pinsPorReserva: filas sin código no cuentan', () => {
  const m = pinsPorReserva([
    { reservaRef: '9', pin: null },
    { reservaRef: '9', pin: '  ' },
  ])
  assert.equal(m.size, 0)
})
