import test from 'node:test'
import assert from 'node:assert/strict'
import { trasResultadoRpa } from './tras-rpa.ts'

test('el borrador se lanza aunque la extracción no termine nunca (tope)', async () => {
  const orden: string[] = []
  const errores: unknown[][] = []
  await trasResultadoRpa('t1', {
    borrador: async () => { orden.push('borrador'); return { estado: 'ok' } },
    extraer: () => { orden.push('extraer'); return new Promise(() => {}) }, // nunca resuelve
    error: (...a) => { errores.push(a) },
  }, 20)
  assert.deepEqual(orden, ['borrador', 'extraer'], 'el borrador va primero')
  assert.ok(errores.some((e) => String(e[2]).includes('sin terminar')), 'el tope se registra')
})

test('si la extracción lanza, el borrador sale igual; si el borrador falla, no rompe', async () => {
  let borrador = 0
  await trasResultadoRpa('t2', {
    borrador: async () => { borrador++; return { estado: 'ok' } },
    extraer: async () => { throw new Error('ia caída') },
    error: () => {},
  }, 20)
  assert.equal(borrador, 1)
  await trasResultadoRpa('t3', { borrador: async () => { throw new Error('x') }, extraer: async () => ({ estado: 'extraida' }), error: () => {} }, 20)
})
