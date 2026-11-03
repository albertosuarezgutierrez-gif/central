import { test } from 'node:test'
import assert from 'node:assert/strict'

import { ordenarConUnidades } from './edificio-vista.ts'

test('cada edificio va seguido de SUS unidades; lo suelto conserva el orden', () => {
  const o = ordenarConUnidades([
    { id: 'a' }, { id: 'p2', inmueblePadreId: 'ed' }, { id: 'ed' }, { id: 'p1', inmueblePadreId: 'ed' }, { id: 'z', inmueblePadreId: null },
  ])
  assert.deepEqual(o.map((x) => [x.fila.id, x.edificioId, x.unidades]), [['a', null, 0], ['ed', null, 2], ['p2', 'ed', 0], ['p1', 'ed', 0], ['z', null, 0]])
})

test('una unidad sin su edificio en la lista sale SUELTA (ni se esconde ni se pega a otro); ninguna fila se pierde', () => {
  const o = ordenarConUnidades([{ id: 'p1', inmueblePadreId: 'archivado' }, { id: 'x' }])
  assert.deepEqual(o.map((x) => [x.fila.id, x.edificioId]), [['p1', null], ['x', null]])
  const roto = ordenarConUnidades([{ id: 'ed' }, { id: 'u', inmueblePadreId: 'ed' }, { id: 'n', inmueblePadreId: 'u' }])
  assert.deepEqual(roto.map((x) => x.fila.id).sort(), ['ed', 'n', 'u'])
})
