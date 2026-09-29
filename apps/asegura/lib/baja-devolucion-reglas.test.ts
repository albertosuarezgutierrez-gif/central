import test from 'node:test'
import assert from 'node:assert/strict'
import { fechaLlamada, motivoBajaValido, vencimientoCompetencia } from './baja-devolucion-reglas.ts'

test('su seguro nuevo renueva en el aniversario del recibo que no pagó, el primero después de hoy', () => {
  assert.equal(vencimientoCompetencia('2026-09-19', '2027-09-19', '2026-09-29'), '2027-09-19')
  // Si ya pasó ese aniversario (se registra tarde), el siguiente.
  assert.equal(vencimientoCompetencia('2025-03-01', null, '2026-09-29'), '2027-03-01')
  // Sin efecto del recibo, el vencimiento de la póliza.
  assert.equal(vencimientoCompetencia(null, '2027-01-15', '2026-09-29'), '2027-01-15')
  // 29 de febrero en un año que no es bisiesto.
  assert.equal(vencimientoCompetencia('2024-02-29', null, '2026-09-29'), '2027-02-28')
  // Un recibo de hace años no deja sin fecha si la póliza sí la trae.
  assert.equal(vencimientoCompetencia('2019-05-10', '2027-01-15', '2026-09-29'), '2027-01-15')
})

test('sin ninguna fecha legible no se inventa el vencimiento', () => {
  assert.equal(vencimientoCompetencia(null, null, '2026-09-29'), null)
  assert.equal(vencimientoCompetencia('2026-13-40', 'basura', '2026-09-29'), null)
})

test('la llamada va 45 días antes del vencimiento y nunca antes de mañana', () => {
  assert.equal(fechaLlamada('2027-09-19', '2026-09-29'), '2027-08-05')
  assert.equal(fechaLlamada('2026-10-15', '2026-09-29'), '2026-09-30')
  assert.equal(fechaLlamada(null, '2026-09-29'), '2026-09-30')
})

test('solo los motivos de la lista', () => {
  assert.equal(motivoBajaValido('competidor'), 'competidor')
  assert.equal(motivoBajaValido('error_alta'), null)
  assert.equal(motivoBajaValido(undefined), null)
})
