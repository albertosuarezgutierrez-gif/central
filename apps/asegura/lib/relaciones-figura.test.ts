import test from 'node:test'
import assert from 'node:assert/strict'

import { contarFiguras } from './relaciones-figura.ts'

test('figura como propietaria en una póliza viva de otro tomador: 1, sin duplicar roles', () => {
  const m = contarFiguras({
    filas: [
      { polizaId: 'p1', clienteId: 'nieves' },
      { polizaId: 'p1', clienteId: 'nieves' },
    ],
    polizasVivas: [{ id: 'p1', clienteId: 'victor' }],
  })
  assert.equal(m.get('nieves'), 1)
})

test('póliza no viva (ausente de la lista) o suya como tomadora no cuenta', () => {
  const m = contarFiguras({
    filas: [
      { polizaId: 'vieja', clienteId: 'nieves' },
      { polizaId: 'suya', clienteId: 'nieves' },
    ],
    polizasVivas: [{ id: 'suya', clienteId: 'nieves' }],
  })
  assert.equal(m.has('nieves'), false)
})

test('fila sin ficha se ignora', () => {
  assert.equal(contarFiguras({ filas: [{ polizaId: 'p1', clienteId: null }], polizasVivas: [{ id: 'p1', clienteId: 'x' }] }).size, 0)
})
