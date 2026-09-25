import test from 'node:test'
import assert from 'node:assert/strict'

import { empresasDelDueno, type FichaDueno, type TipoFicha } from './dueno-empresa.ts'

const f = (tipo: TipoFicha, correduriaId = 'c1'): FichaDueno => ({ tipo, correduriaId })
const tipos = new Map<string, FichaDueno>([
  ['diego', f(null)],
  ['flores-sl', f('juridica')],
  ['otra-sl', f('juridica')],
  ['maria', f('fisica')],
  ['sin-tipo', f(null)],
  ['ajena-sl', f('juridica', 'c2')],
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

test('falla cerrado: ficha propia fuera del mapa (inactiva o fusionada) o de otra correduría no abre nada', () => {
  const rel = [{ clienteAId: 'diego', clienteBId: 'flores-sl', tipoRelacion: 'Dueño' }]
  const sinDiego = new Map([...tipos].filter(([k]) => k !== 'diego'))
  assert.deepEqual(empresasDelDueno(['diego'], rel, sinDiego), [])
  // Una SL inactiva de la identidad (fuera del mapa) no abre otra SL por no tener tipo.
  assert.deepEqual(empresasDelDueno(['muerta-sl'], [{ clienteAId: 'muerta-sl', clienteBId: 'otra-sl', tipoRelacion: 'Dueño' }], tipos), [])
  assert.deepEqual(empresasDelDueno(['diego'], [{ clienteAId: 'diego', clienteBId: 'ajena-sl', tipoRelacion: 'Dueño' }], tipos), [])
})
