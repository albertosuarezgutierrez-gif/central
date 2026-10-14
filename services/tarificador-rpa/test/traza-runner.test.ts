// Cepo (14/10/2026): `tarificacion_trabajo_pasos` estuvo VACÍA porque Moto/Auto/Mapfre no llaman a `ctx.paso`.
// El runner tiene que anotar un paso grueso cuando el adaptador no deja ninguno.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { crearTraza, validarTraza } from '@central/module-tarificacion'

test('el runner cubre la traza de un adaptador que no instrumenta ctx.paso', () => {
  const f = readFileSync(new URL('../src/runner.ts', import.meta.url), 'utf8')
  assert.match(f, /k\.traza\.anotar\('formulario'/)
  assert.match(f, /cubrirTraza\(resultado && !error \? undefined : \{ e: error \}\)/)
})

test('la traza anotada (ok y fallo) es válida para asegura', () => {
  const t = crearTraza(() => 'portal')
  t.anotar('formulario', Date.now() - 1500)
  t.anotar('formulario', Date.now() - 10, { e: new Error('x') })
  assert.equal(validarTraza(t.pasos()).ok, true)
})
