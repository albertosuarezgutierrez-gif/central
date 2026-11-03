// Generali Turismos v0.2.66 (02/11/2026, trabajo f84801ce): tras elegir «Otras versiones ...» el portal marca «Versión» en error y NO cambia la lista. Se compara CONTENIDO (no nº).
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { VERSION_GENERALI_AUTO } from '../src/adapters/generali/auto.ts'
import { listaVersionCambiadaGenerali } from '../src/adapters/generali/reglas.ts'

const ANTES = ['Seleccione una', 'ELECTRIC DRIVE EQ', 'ELECTRIC DRIVE EQ PASSION', 'Otras versiones ...']

test('v0.2.66 · versión', () => assert.equal(VERSION_GENERALI_AUTO, '0.2.71'))

test('v0.2.66 · misma lista (aunque cambie el orden, los espacios de relleno o la elipsis) = sin cambio', () => {
  assert.equal(listaVersionCambiadaGenerali(ANTES, [...ANTES]), false)
  assert.equal(listaVersionCambiadaGenerali(ANTES, ['Otras versiones…', 'ELECTRIC DRIVE EQ PASSION ', 'Seleccione una', 'ELECTRIC DRIVE EQ  ']), false)
})

test('v0.2.66 · mismo nº de opciones con OTRO contenido = cambio; lista más larga = cambio; subconjunto con alguna real = cambio', () => {
  assert.equal(listaVersionCambiadaGenerali(ANTES, ['Seleccione una', 'ELECTRIC DRIVE EQ', '1.0 52KW PASSION', 'Otras versiones ...']), true)
  assert.equal(listaVersionCambiadaGenerali(ANTES, [...ANTES, '1.0 52KW PULSE']), true)
  assert.equal(listaVersionCambiadaGenerali(ANTES, ['Seleccione una', 'ELECTRIC DRIVE EQ']), true)
})

test('v0.2.66 · una lista vacía o solo «Seleccione…»/«Otras…» no es una lista ampliada', () => {
  assert.equal(listaVersionCambiadaGenerali(ANTES, []), false)
  assert.equal(listaVersionCambiadaGenerali(ANTES, ['Seleccione una']), false)
  assert.equal(listaVersionCambiadaGenerali(ANTES, ['Seleccione una', 'Otras versiones ...']), false)
})
