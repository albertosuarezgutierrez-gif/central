import test from 'node:test'
import assert from 'node:assert/strict'
import { relacionesSugeribles } from './sugerencia-relacion.ts'
import { SIN_VINCULO, type RelacionFila } from '@central/module-seguros'

const fila = (p: Partial<RelacionFila> & Pick<RelacionFila, 'id' | 'clienteAId' | 'clienteBId' | 'tipo'>): RelacionFila => ({
  puedeVerPolizas: false,
  observaciones: null,
  ...p,
})

test('sugiere la madre porque hay vínculo y todavía no la puede ver', () => {
  const manuel = 'manuel-antonio', pilar = 'pilar-franco'
  const filas = [
    fila({ id: '1', clienteAId: manuel, clienteBId: pilar, tipo: 'Padre/Madre' }),
    fila({ id: '2', clienteAId: pilar, clienteBId: manuel, tipo: 'Hijo/a' }),
  ]
  const r = relacionesSugeribles(filas, manuel)
  assert.equal(r.length, 1)
  assert.deepEqual(r[0], { relacionadoId: pilar, tipo: 'Padre/Madre' })
})

test('sugiere también la empresa, con su propio tipo', () => {
  const manuel = 'manuel-antonio', global2 = 'global-2'
  const filas = [
    fila({ id: '1', clienteAId: manuel, clienteBId: global2, tipo: 'Empresa' }),
    fila({ id: '2', clienteAId: global2, clienteBId: manuel, tipo: 'Dueño' }),
  ]
  const r = relacionesSugeribles(filas, manuel)
  assert.equal(r.length, 1)
  assert.deepEqual(r[0], { relacionadoId: global2, tipo: 'Empresa' })
})

test('no sugiere una relación «Sin vínculo»', () => {
  const jose = 'jose', antonio = 'antonio'
  const filas = [fila({ id: '1', clienteAId: jose, clienteBId: antonio, tipo: SIN_VINCULO })]
  assert.deepEqual(relacionesSugeribles(filas, jose), [])
})

test('no sugiere lo que ya se puede ver', () => {
  const jose = 'jose', maria = 'maria'
  const filas = [fila({ id: '1', clienteAId: maria, clienteBId: jose, tipo: 'Cónyuge/Pareja de Hecho', puedeVerPolizas: true })]
  // Desde la ficha de José: María→José con el flag puesto = José PUEDE ver a María.
  assert.deepEqual(relacionesSugeribles(filas, jose), [])
})
