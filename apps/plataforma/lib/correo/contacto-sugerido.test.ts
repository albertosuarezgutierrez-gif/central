import test from 'node:test'
import assert from 'node:assert/strict'

import { pareceContactoPersonal } from './contacto-sugerido.ts'

test('pareceContactoPersonal: un nombre.apellido es persona', () => {
  assert.equal(pareceContactoPersonal('ana.lopez@occidentinforma.com'), true)
})

test('🚨 los buzones genéricos conocidos NO se sugieren (ya se sabe que son genéricos)', () => {
  for (const local of ['mediadores', 'comunicacion.mediadores', 'no-reply', 'info', 'notificaciones']) {
    assert.equal(pareceContactoPersonal(`${local}@occidentinforma.com`), false, local)
  }
})

test('sin @ o vacío, no se sugiere (no hay nada que sugerir)', () => {
  assert.equal(pareceContactoPersonal(''), false)
  assert.equal(pareceContactoPersonal('texto sin arroba'), false)
})

test('mayúsculas y variantes no cuelan un genérico como persona', () => {
  assert.equal(pareceContactoPersonal('Mediadores@Occident.com'), false)
})
