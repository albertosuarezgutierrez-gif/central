// El texto de un confirm/alert del portal entra en el error: un nombre propio no puede salir en claro (datos sintéticos).
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { textoDialogoPortalSeguro } from '../src/guard.ts'

test('un nombre propio sintético no aparece en el texto del diálogo y el sentido del mensaje se conserva', () => {
  const t = textoDialogoPortalSeguro('Juan Pérez García: la fecha de expedición del carné es anterior a los 18 años')
  assert.ok(!/Juan|P[eé]rez|Garc[ií]a/.test(t), t)
  assert.match(t, /\[nombre\]/)
  assert.match(t, /la fecha de expedición del carné es anterior a los 18 años/)
  const m = textoDialogoPortalSeguro('MARIA DE LOS ANGELES RUIZ ya consta como tomadora')
  assert.ok(!/MARIA|ANGELES|RUIZ/.test(m), m)
})

test('un mensaje normal pasa intacto y se limita a 200 caracteres', () => {
  assert.equal(textoDialogoPortalSeguro('La fecha de expedición del carné es anterior a los 18 años'), 'La fecha de expedición del carné es anterior a los 18 años')
  assert.equal(textoDialogoPortalSeguro('a'.repeat(500)).length, 200)
})

test('el manejador de diálogos del avance de pestaña usa el saneador', () => {
  const src = readFileSync(new URL('../src/guard.ts', import.meta.url), 'utf8')
  assert.match(src, /mensaje: textoDialogoPortalSeguro\(d\.message\(\)\)/)
})
