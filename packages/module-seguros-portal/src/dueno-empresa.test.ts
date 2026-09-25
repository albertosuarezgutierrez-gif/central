import test from 'node:test'
import assert from 'node:assert/strict'

import { empresasDelDueno, type TipoFicha } from './dueno-empresa.ts'

const tipos = new Map<string, TipoFicha>([
  ['diego', null],
  ['flores-sl', 'juridica'],
  ['otra-sl', 'juridica'],
  ['maria', 'fisica'],
  ['sin-tipo', null],
])

test('el dueño ve su empresa, sea cual sea la dirección de la fila', () => {
  assert.deepEqual(empresasDelDueno(['diego'], [{ clienteAId: 'diego', clienteBId: 'flores-sl', tipoRelacion: 'Dueño' }], tipos), ['flores-sl'])
  assert.deepEqual(empresasDelDueno(['diego'], [{ clienteAId: 'flores-sl', clienteBId: 'diego', tipoRelacion: 'Dueño' }], tipos), ['flores-sl'])
})

test('Administración, Empresa u otro tipo NO abren la empresa', () => {
  for (const tipoRelacion of ['Administración', 'Empresa', 'Empleado/a', 'Socio/a']) {
    assert.deepEqual(empresasDelDueno(['diego'], [{ clienteAId: 'diego', clienteBId: 'flores-sl', tipoRelacion }], tipos), [], tipoRelacion)
  }
})

test('la otra ficha tiene que ser jurídica EXPLÍCITA: un NULL no inventa una empresa', () => {
  assert.deepEqual(empresasDelDueno(['diego'], [{ clienteAId: 'diego', clienteBId: 'sin-tipo', tipoRelacion: 'Dueño' }], tipos), [])
  assert.deepEqual(empresasDelDueno(['diego'], [{ clienteAId: 'diego', clienteBId: 'maria', tipoRelacion: 'Dueño' }], tipos), [])
})

test('dos jurídicas entre sí no abren nada, y una relación ajena tampoco', () => {
  assert.deepEqual(empresasDelDueno(['flores-sl'], [{ clienteAId: 'flores-sl', clienteBId: 'otra-sl', tipoRelacion: 'Dueño' }], tipos), [])
  assert.deepEqual(empresasDelDueno(['maria'], [{ clienteAId: 'diego', clienteBId: 'flores-sl', tipoRelacion: 'Dueño' }], tipos), [])
})
