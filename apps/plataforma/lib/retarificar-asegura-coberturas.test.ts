import test from 'node:test'
import assert from 'node:assert/strict'
import { interpretarCoberturas } from './retarificar-asegura.ts'

test('interpretarCoberturas: incluida ausente es null («ver texto»), nunca false', () => {
  const r = interpretarCoberturas(200, {
    estado: 'ok',
    coberturas: [
      { nombre: 'Lunas', incluida: true, texto: null },
      { nombre: 'Asistencia', texto: 'Desde km 0' },
      { nombre: '' },
    ],
  })
  assert.deepEqual(r, {
    estado: 'ok',
    coberturas: [
      { nombre: 'Lunas', incluida: true, texto: null },
      { nombre: 'Asistencia', incluida: null, texto: 'Desde km 0' },
    ],
  })
})

test('interpretarCoberturas: un fallo del puerto es error, no «ninguna cobertura»', () => {
  const r = interpretarCoberturas(502, { estado: 'error', mensaje: 'timeout' })
  assert.equal(r.estado, 'error')
  const r2 = interpretarCoberturas(200, { estado: 'ok' })
  assert.equal(r2.estado, 'error')
})
