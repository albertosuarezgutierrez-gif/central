import { test } from 'node:test'
import assert from 'node:assert/strict'

import { MENSAJE_PARTE_SINIESTRO, puedeBorrarDeclarada } from './poliza-borrable.ts'

test('una póliza aportada sin partes se puede quitar', () => {
  assert.deepEqual(puedeBorrarDeclarada({ partes: 0 }), { puede: true })
})

test('un parte de siniestro lo impide, y dice por qué', () => {
  const r = puedeBorrarDeclarada({ partes: 1 })
  assert.equal(r.puede, false)
  assert.equal(r.puede === false && r.reparo, 'parte_siniestro')
  assert.equal(r.puede === false && r.mensaje, MENSAJE_PARTE_SINIESTRO)
})

test('el reparo no depende del estado del parte: basta con que exista', () => {
  // Un parte descartado sigue contando. Si esto dejara de ser así, el borrado
  // dejaría huérfano (FK ON DELETE SET NULL) un parte que la correduría ya vio.
  assert.equal(puedeBorrarDeclarada({ partes: 3 }).puede, false)
})

test('el mensaje no promete que se pueda borrar más tarde', () => {
  // Un «inténtalo luego» sería falso: el parte no se va a ir solo.
  assert.ok(!/más tarde|luego|vuelve a intentarlo/i.test(MENSAJE_PARTE_SINIESTRO))
  assert.ok(/escríbenos/i.test(MENSAJE_PARTE_SINIESTRO))
})
