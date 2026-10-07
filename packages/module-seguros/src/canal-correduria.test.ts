import { test } from 'node:test'
import assert from 'node:assert/strict'
import { esCanalCorreduria } from './canal-correduria.ts'
import { MEDIADOR } from './mediador.ts'

test('email de la correduría: mayúsculas, espacios y +etiqueta', () => {
  assert.equal(esCanalCorreduria('hola@grupoasegura.es'), true)
  assert.equal(esCanalCorreduria(' HOLA@GrupoASegura.es '), true)
  assert.equal(esCanalCorreduria('hola+maria@grupoasegura.es'), true)
})
test('teléfono de la correduría: con/sin +34, 0034 y espacios', () => {
  const t = MEDIADOR.identidad.telefono.replace(/\D/g, '').slice(-9)
  assert.equal(esCanalCorreduria(t), true)
  assert.equal(esCanalCorreduria(`+34 ${t.slice(0, 3)} ${t.slice(3, 6)} ${t.slice(6)}`), true)
  assert.equal(esCanalCorreduria(`0034${t}`), true)
})
test('lo que no es de la correduría, o no se sabe, es false', () => {
  assert.equal(esCanalCorreduria('maria@gmail.com'), false)
  assert.equal(esCanalCorreduria('info@grupoasegura.es'), false)
  assert.equal(esCanalCorreduria('600111222'), false)
  assert.equal(esCanalCorreduria(null), false)
  assert.equal(esCanalCorreduria(undefined), false)
  assert.equal(esCanalCorreduria(''), false)
})
