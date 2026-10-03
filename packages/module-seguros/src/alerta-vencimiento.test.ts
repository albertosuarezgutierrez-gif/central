import test from 'node:test'
import assert from 'node:assert/strict'
import { alertaVencimiento } from './alerta-vencimiento.ts'
import { diaIsoPintable, fechaPintable } from './fecha-pintable.ts'

const HOY = '2026-10-03'

test('vencimiento pasado: SOLO «Venció el», sin fecha de aviso ni «renueva otro año»', () => {
  const a = alertaVencimiento('2026-06-05', HOY)
  assert.equal(a.estado, 'vencido')
  assert.equal(a.titular, 'Venció el 05/06/2026')
  assert.equal(a.nota, null)
  assert.equal(a.limiteAviso, null)
  assert.ok(!JSON.stringify(a).includes('06/05/2026'))
})

test('sin fecha, ilegible o centinela: SOLO «Vencimiento desconocido»', () => {
  for (const v of [null, undefined, '', 'basura', '1900-01-01', '9999-12-31', '2026-02-30']) {
    const a = alertaVencimiento(v, HOY)
    assert.equal(a.estado, 'desconocido', String(v))
    assert.equal(a.titular, 'Vencimiento desconocido')
    assert.equal(a.nota, null)
  }
})

test('futuro con aviso posible: «Vence» + fecha de aviso futura', () => {
  const a = alertaVencimiento('2026-11-10', HOY)
  assert.equal(a.estado, 'en_plazo')
  assert.equal(a.titular, 'Vence 10/11/2026')
  assert.equal(a.limiteAviso, '2026-10-10')
  assert.equal(a.nota, 'para no renovar, avisar antes del 10/10/2026')
})

test('futuro con aviso ya pasado: se dice «aviso pasado», nunca una fecha de aviso', () => {
  const a = alertaVencimiento('2026-10-20', HOY)
  assert.equal(a.estado, 'aviso_pasado')
  assert.equal(a.titular, 'Vence 20/10/2026')
  assert.equal(a.nota, 'aviso pasado: renueva otro año')
})

test('vence hoy sigue en vigor; el límite de aviso a fin de mes (31/03 → 28/02)', () => {
  assert.equal(alertaVencimiento(HOY, HOY).estado, 'aviso_pasado')
  assert.equal(alertaVencimiento('2027-03-31', '2027-02-28').limiteAviso, '2027-02-28')
})

test('acepta timestamp ISO', () => {
  assert.equal(alertaVencimiento('2026-06-05T00:00:00.000Z', HOY).titular, 'Venció el 05/06/2026')
})

test('fechas centinela no se pintan', () => {
  assert.equal(fechaPintable('1900-01-01'), null)
  assert.equal(fechaPintable('1900-01-01T00:00:00Z'), null)
  assert.equal(fechaPintable('9999-12-31'), null)
  assert.equal(fechaPintable('0001-01-01'), null)
  assert.equal(fechaPintable('2026-01-08'), '08/01/2026')
  assert.equal(diaIsoPintable('2026-13-01'), null)
  assert.equal(fechaPintable(null), null)
})
