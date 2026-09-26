import { test } from 'node:test'
import assert from 'node:assert/strict'
import { leerTodasLasPaginas } from './smoobu-paginas.ts'

const msg = (id: number) => ({ id, message: `m${id}` })

test('reserva de 27 mensajes: trae también la página 2 (caso 150035011)', async () => {
  const paginas: Record<number, any> = {
    1: { page: 1, page_size: 25, page_count: 2, total_items: 27, messages: Array.from({ length: 25 }, (_, i) => msg(i + 1)) },
    2: { page: 2, page_size: 25, page_count: 2, total_items: 27, messages: [msg(26), msg(27)] },
  }
  const r = await leerTodasLasPaginas(async p => paginas[p])
  assert.equal(r?.length, 27)
  assert.equal(r?.at(-1)?.id, 27, 'el último mensaje es el más nuevo, no el 25')
})

test('una sola página: no pide más', async () => {
  let llamadas = 0
  const r = await leerTodasLasPaginas(async () => { llamadas++; return { page_count: 1, messages: [msg(1)] } })
  assert.equal(r?.length, 1)
  assert.equal(llamadas, 1)
})

test('una página intermedia que falla → null, nunca un hilo a medias', async () => {
  const r = await leerTodasLasPaginas(async p => {
    if (p === 2) throw new Error('red')
    return { page_count: 2, messages: [msg(p)] }
  })
  assert.equal(r, null)
})

test('primera página ilegible → null', async () => {
  assert.equal(await leerTodasLasPaginas(async () => ({ error: 'x' } as any)), null)
  assert.equal(await leerTodasLasPaginas(async () => { throw new Error('red') }), null)
})

test('respuesta sin paginar (array) se acepta tal cual', async () => {
  const r = await leerTodasLasPaginas(async () => [msg(1), msg(2)])
  assert.equal(r?.length, 2)
})

test('page_count desmesurado se acota al tope', async () => {
  let llamadas = 0
  await leerTodasLasPaginas(async () => { llamadas++; return { page_count: 9999, messages: [msg(1)] } }, 3)
  assert.equal(llamadas, 3)
})
