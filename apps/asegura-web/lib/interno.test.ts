import { test } from 'node:test'
import assert from 'node:assert/strict'
import { esDispositivoInterno, CLAVE_INTERNO } from './interno.ts'

function almacen() {
  const m = new Map<string, string>()
  return {
    m,
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
  }
}

test('un visitante normal NO es interno', () => {
  assert.equal(esDispositivoInterno('', almacen()), false)
  assert.equal(esDispositivoInterno('?utm_source=google', almacen()), false)
})

test('?interno=1 marca el navegador y la marca sobrevive a la siguiente visita sin parámetro', () => {
  const a = almacen()
  assert.equal(esDispositivoInterno('?interno=1', a), true)
  assert.equal(a.m.get(CLAVE_INTERNO), '1')
  assert.equal(esDispositivoInterno('', a), true)
})

test('?interno=0 quita la marca', () => {
  const a = almacen()
  esDispositivoInterno('?interno=1', a)
  assert.equal(esDispositivoInterno('?interno=0', a), false)
  assert.equal(esDispositivoInterno('', a), false)
})

test('sin almacén, o si el almacén lanza (modo privado), no es interno y no rompe', () => {
  assert.equal(esDispositivoInterno('?interno=1', null), false)
  const roto = { getItem: () => { throw new Error('x') }, setItem: () => { throw new Error('x') }, removeItem: () => {} }
  assert.equal(esDispositivoInterno('?interno=1', roto), false)
})
