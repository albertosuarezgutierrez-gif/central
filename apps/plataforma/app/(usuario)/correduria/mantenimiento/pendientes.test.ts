import { test } from 'node:test'
import assert from 'node:assert/strict'
import { quedanPorEscribir } from './pendientes.ts'

test('sin escritura todavía, manda la cifra del plan', () => {
  assert.equal(quedanPorEscribir(476, null), 476)
})

test('tras escribir, manda `restantes` — que es quien acaba de contar', () => {
  // El caso que se vio en pantalla: se escriben las 476 y no queda ninguna.
  assert.equal(quedanPorEscribir(476, { estado: 'ok', escritos: 476, restantes: 0, fallidos: 0 }), 0)
})

test('una tanda parcial deja las que faltan, no las del plan', () => {
  assert.equal(quedanPorEscribir(15092, { estado: 'ok', escritos: 8000, restantes: 7092, fallidos: 0 }), 7092)
})

test('un error NO se lee como «no queda ninguna»', () => {
  // Puede haberse escrito todo, nada o la mitad: no se sabe. Se mantiene la
  // última cifra conocida en vez de afirmar que ya está.
  assert.equal(quedanPorEscribir(476, { estado: 'error', motivo: 'se cortó la conexión' }), 476)
  assert.equal(quedanPorEscribir(476, { estado: 'sin_configurar' }), 476)
})
