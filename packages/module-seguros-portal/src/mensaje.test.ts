import { test } from 'node:test'
import assert from 'node:assert/strict'

import { agruparHilos, MAX_CUERPO_MENSAJE, normalizarCuerpo, sinLeerPara, type Mensaje } from './mensaje.ts'

const m = (id: string, autor: Mensaje['autor'], creadoAt: string, polizaId: string | null = null, leidoAt: string | null = null): Mensaje =>
  ({ id, autor, cuerpo: 'x', polizaId, creadoAt, leidoAt })

test('el cuerpo: vacío o solo espacios no vale; largo de más tampoco; se recorta', () => {
  assert.equal(normalizarCuerpo('  '), null)
  assert.equal(normalizarCuerpo(42), null)
  assert.equal(normalizarCuerpo('a'.repeat(MAX_CUERPO_MENSAJE + 1)), null)
  assert.equal(normalizarCuerpo('  hola\r\n '), 'hola')
})

test('🪤 «sin leer» cuenta solo lo del OTRO lado: lo que escribí yo no me lo debo a mí', () => {
  const lista = [m('1', 'cliente', '2026-09-24T10:00:00Z'), m('2', 'corredor', '2026-09-24T11:00:00Z')]
  assert.equal(sinLeerPara(lista, 'cliente'), 1)
  assert.equal(sinLeerPara(lista, 'corredor'), 1)
  assert.equal(sinLeerPara([m('3', 'corredor', '2026-09-24T12:00:00Z', null, '2026-09-24T13:00:00Z')], 'cliente'), 0)
})

test('los hilos: uno por póliza (y el general), el más reciente primero, mensajes en orden', () => {
  const hilos = agruparHilos(
    [
      m('a', 'cliente', '2026-09-20T10:00:00Z', 'p1'),
      m('b', 'cliente', '2026-09-22T10:00:00Z', null),
      m('c', 'corredor', '2026-09-21T10:00:00Z', 'p1'),
      m('d', 'corredor', '2026-09-19T10:00:00Z', 'p1'),
    ],
    'cliente',
    (id) => (id === null ? 'General' : `Póliza ${id}`),
  )
  assert.deepEqual(hilos.map((h) => h.polizaId), [null, 'p1'])
  assert.deepEqual(hilos[1].mensajes.map((x) => x.id), ['d', 'a', 'c'])
  assert.equal(hilos[1].sinLeer, 2)
  assert.equal(hilos[0].titulo, 'General')
})
