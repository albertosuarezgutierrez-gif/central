import { test } from 'node:test'
import assert from 'node:assert/strict'
import { diasHastaAniversario, dentroVentanaAntiguo, proximoAniversario, VENTANA_DIAS_ANTIGUO } from './recaptacion-ventana.ts'

const hoy = new Date('2026-09-20T10:00:00Z')

test('un aniversario que ya pasó este año salta a el año que viene', () => {
  // 1 de marzo ya pasó (estamos a 20/09) -> el próximo es marzo de 2027.
  const a = proximoAniversario(3, 1, hoy)
  assert.equal(a.getUTCFullYear(), 2027)
  assert.equal(a.getUTCMonth(), 2) // marzo = índice 2
  assert.equal(a.getUTCDate(), 1)
})

test('un aniversario que aún no ha llegado este año se queda en este año', () => {
  const a = proximoAniversario(12, 25, hoy)
  assert.equal(a.getUTCFullYear(), 2026)
})

test('hoy mismo cuenta como el aniversario (0 días), no se manda al año que viene', () => {
  const d = diasHastaAniversario(9, 20, hoy)
  assert.equal(d, 0)
})

test('29 de febrero en año no bisiesto se ajusta al 28, no revienta', () => {
  const a = proximoAniversario(2, 29, new Date('2026-01-01T00:00:00Z'))
  assert.equal(a.getUTCMonth(), 1)
  assert.equal(a.getUTCDate(), 28)
})

test('dentro de los 45 días de antelación: SÍ está en ventana', () => {
  // 1 de noviembre está a 42 días del 20/09 -> dentro de la ventana de 45.
  assert.equal(dentroVentanaAntiguo(11, 1, hoy), true)
})

test('fuera de los 45 días de antelación: NO está en ventana', () => {
  // 1 de diciembre está a 72 días -> fuera.
  assert.equal(dentroVentanaAntiguo(12, 1, hoy), false)
})

test('justo en el borde de la ventana (45 días) cuenta como dentro', () => {
  const d = diasHastaAniversario(11, 4, hoy) // 20/09 + 45 = 4/11
  assert.equal(d, VENTANA_DIAS_ANTIGUO)
  assert.equal(dentroVentanaAntiguo(11, 4, hoy), true)
})

test('un día más allá del borde ya no cuenta', () => {
  assert.equal(dentroVentanaAntiguo(11, 5, hoy), false)
})
