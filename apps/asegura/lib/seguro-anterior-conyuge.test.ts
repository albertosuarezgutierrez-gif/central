import test from 'node:test'
import assert from 'node:assert/strict'
import { conyugesDe } from './seguro-anterior-conyuge.ts'

const rel = (relacionadoId: string, tipo: string, nombre = relacionadoId) => ({ relacionadoId, tipo, nombre })

test('incluye al cónyuge/pareja y excluye cualquier otra relación', () => {
  const r = [rel('c1', 'Cónyuge/Pareja de Hecho', 'Ana Ruiz'), rel('h1', 'Hijo/a'), rel('n1', 'Novio/a'), rel('e1', 'Empresa'), rel('s1', 'Sin vínculo')]
  assert.deepEqual(conyugesDe(r, 't'), [{ id: 'c1', nombre: 'Ana Ruiz' }])
})

test('sin cónyuge, nada; sin repetir ni incluir al propio tomador', () => {
  assert.deepEqual(conyugesDe([rel('h1', 'Hijo/a')], 't'), [])
  assert.deepEqual(conyugesDe([rel('c1', 'Cónyuge/Pareja de Hecho'), rel('c1', 'Cónyuge/Pareja de Hecho'), rel('t', 'Cónyuge/Pareja de Hecho')], 't').map((c) => c.id), ['c1'])
})
