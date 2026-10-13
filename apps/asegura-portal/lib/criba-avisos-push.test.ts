import test from 'node:test'
import assert from 'node:assert/strict'

import { reunirAvisables } from './criba-avisos-push.ts'

// Ventana de 25 filas, páginas de 5; las 15 primeras son de identidades que se saltan a propósito.
const todas = Array.from({ length: 25 }, (_, i) => ({ id: `f${String(i).padStart(2, '0')}`, saltar: i < 15 }))
const leer = (calls: Array<string | null>) => async (c: string | null) => {
  calls.push(c)
  const ini = c === null ? 0 : todas.findIndex((x) => x.id === c) + 1
  return todas.slice(ini, ini + 5)
}
const filtrar = async (p: typeof todas) => p.filter((x) => !x.saltar)

test('🪤 las filas saltadas no acaparan el lote: se pagina hasta reunir avisables', async () => {
  const calls: Array<string | null> = []
  const r = await reunirAvisables({ leerPagina: leer(calls), filtrar, tamPagina: 5, objetivo: 8 })
  assert.equal(r.filas.length, 8)
  assert.ok(r.filas.every((x) => !x.saltar))
  assert.deepEqual(calls, [null, 'f04', 'f09', 'f14', 'f19'])
})

test('agota la ventana si hay menos avisables que el objetivo', async () => {
  const r = await reunirAvisables({ leerPagina: leer([]), filtrar, tamPagina: 5, objetivo: 500 })
  assert.equal(r.filas.length, 10)
  assert.equal(r.paginas, 6)
})

test('el tope de páginas corta la ejecución', async () => {
  const r = await reunirAvisables({ leerPagina: leer([]), filtrar, tamPagina: 5, objetivo: 500, maxPaginas: 2 })
  assert.equal(r.paginas, 2)
  assert.equal(r.filas.length, 0)
})
