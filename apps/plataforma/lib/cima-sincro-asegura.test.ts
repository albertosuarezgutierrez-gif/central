import { test } from 'node:test'
import assert from 'node:assert/strict'
import { contadorSincroCima, interpretarSincroCima } from './cima-sincro-asegura.ts'

const ok = {
  estado: 'ok', fichas: 101, sinDatosCima: 37, rellenos: 3, ilegibles: 0,
  discrepancias: [{ clienteId: 'c1', nombre: 'Pablo', poliza: '123', diferencias: [{ campo: 'telefono', accion: 'discrepa', ficha: '611', cima: '600' }] }],
}

test('lectura buena → cuenta las diferencias por decidir', () => {
  const l = interpretarSincroCima(200, ok)
  assert.equal(l.estado, 'ok')
  assert.equal(contadorSincroCima(l), 1)
})

test('una fila rara tumba la lectura: nunca una lista con una ficha de menos', () => {
  const malo = { ...ok, discrepancias: [...ok.discrepancias, { clienteId: 'c2', nombre: 'X', diferencias: [{ campo: 'dni', accion: 'discrepa', cima: 'a' }] }] }
  const l = interpretarSincroCima(200, malo)
  assert.equal(l.estado, 'error')
  assert.equal(contadorSincroCima(l), null)
})

test('no se pudo leer → contador null, nunca 0', () => {
  assert.equal(contadorSincroCima(interpretarSincroCima(500, { estado: 'error', causa: 'x' })), null)
  assert.equal(interpretarSincroCima(404, null).estado, 'no_desplegado')
  assert.equal(interpretarSincroCima(401, null).estado, 'error')
})
