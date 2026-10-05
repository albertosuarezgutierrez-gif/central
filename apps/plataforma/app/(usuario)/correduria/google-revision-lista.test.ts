import { test } from 'node:test'
import assert from 'node:assert/strict'
import { anadirPagina, hayMas, primeraPagina, quitarResuelta } from './google-revision-lista.ts'

const pag = (ids: string[], siguiente: string | null, pendientes: number) => ({ revisiones: ids.map((id) => ({ id })), siguiente, pendientes })

test('🪤 resolver todas las cargadas NO esconde «Ver más» si el servidor tiene más', () => {
  let l = primeraPagina(pag(['a', 'b'], 'b', 3))
  l = quitarResuelta(l, 'a')
  l = quitarResuelta(l, 'b')
  assert.equal(l.tarjetas.length, 0)
  assert.equal(hayMas(l), true)
  assert.equal(l.siguiente, 'b')
  assert.equal(l.pendientes, 1)
})

test('«Ver más» añade sin duplicar y desaparece solo cuando el servidor dice que no hay más', () => {
  let l = primeraPagina(pag(['a', 'b'], 'b', 3))
  l = anadirPagina(l, pag(['b', 'c'], null, 3))
  assert.deepEqual(l.tarjetas.map((t) => t.id), ['a', 'b', 'c'])
  assert.equal(hayMas(l), false)
})

test('quitar una que no está no descuenta pendientes', () => {
  const l = primeraPagina(pag(['a'], null, 1))
  assert.equal(quitarResuelta(l, 'zz').pendientes, 1)
})
