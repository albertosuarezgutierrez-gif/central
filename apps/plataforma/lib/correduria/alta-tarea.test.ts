import test from 'node:test'
import assert from 'node:assert/strict'
import { motivoAltaTarea } from './alta-tarea.ts'

test('alta de tarea: cada carencia se dice, nunca un fallo mudo', () => {
  assert.match(motivoAltaTarea({ clienteId: null, que: 'Seguro rc salón celebraciones', fecha: '2026-11-06' }) ?? '', /cliente/i)
  assert.match(motivoAltaTarea({ clienteId: '', que: 'x', fecha: '2026-11-06' }) ?? '', /cliente/i)
  assert.match(motivoAltaTarea({ clienteId: 'abc', que: '   ', fecha: '2026-11-06' }) ?? '', /qué hay que hacer/i)
  assert.match(motivoAltaTarea({ clienteId: 'abc', que: 'x', fecha: '06/11/2026' }) ?? '', /fecha/i)
  assert.equal(motivoAltaTarea({ clienteId: 'abc', que: 'Seguro rc salón celebraciones', fecha: '2026-11-06' }), null)
})
