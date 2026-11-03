import test from 'node:test'
import assert from 'node:assert/strict'
import { hashesPdfVigentes, esPdfHuerfano } from './huerfanas-pdf.ts'

test('hashesPdfVigentes prefija pdf:', () => {
  assert.deepEqual(hashesPdfVigentes(['A1', 'B2']), ['pdf:A1', 'pdf:B2'])
  assert.deepEqual(hashesPdfVigentes([]), [])
})

test('huérfana: pdf cuyo hash ya no está vigente; manual/cima nunca', () => {
  const v = hashesPdfVigentes(['A1'])
  assert.equal(esPdfHuerfano({ liqOrigen: 'pdf', liqHash: 'pdf:OLD' }, v), true)
  assert.equal(esPdfHuerfano({ liqOrigen: 'pdf', liqHash: null }, v), true)
  assert.equal(esPdfHuerfano({ liqOrigen: 'pdf', liqHash: 'pdf:A1' }, v), false)
  assert.equal(esPdfHuerfano({ liqOrigen: 'manual', liqHash: 'pdf:OLD' }, v), false)
  assert.equal(esPdfHuerfano({ liqOrigen: 'cima', liqHash: 'x' }, v), false)
  assert.equal(esPdfHuerfano({ liqOrigen: 'pdf', liqHash: 'pdf:A1' }, []), true)
})
