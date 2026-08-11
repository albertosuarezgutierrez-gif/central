// Tests de la lógica pura de traspasos "en tránsito".
// Runner: node --test (Node 22, type-stripping nativo).

import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  iniciarTraspaso,
  confirmarRecepcion,
  cancelarTraspaso,
} from '../src/transferencias.ts'

test('iniciar mueve disponible→enTransito en origen', () => {
  assert.deepEqual(iniciarTraspaso({ disponible: 10, enTransito: 0 }, 4), {
    disponible: 6,
    enTransito: 4,
  })
})

test('iniciar acumula sobre enTransito previo', () => {
  assert.deepEqual(iniciarTraspaso({ disponible: 10, enTransito: 2 }, 3), {
    disponible: 7,
    enTransito: 5,
  })
})

test('iniciar no permite más de lo disponible', () => {
  assert.throws(() => iniciarTraspaso({ disponible: 3, enTransito: 0 }, 4))
})

test('iniciar rechaza cantidad no positiva', () => {
  assert.throws(() => iniciarTraspaso({ disponible: 3, enTransito: 0 }, 0))
})

test('confirmar total: origen libera enTransito, destino suma recibidas', () => {
  const r = confirmarRecepcion(
    { disponible: 6, enTransito: 4 },
    { disponible: 0, enTransito: 0 },
    4,
    0,
  )
  assert.deepEqual(r.origen, { disponible: 6, enTransito: 0 })
  assert.deepEqual(r.destino, { disponible: 4, enTransito: 0 })
  assert.equal(r.rotas, 0)
  assert.equal(r.estado, 'recibida')
})

test('confirmar parcial con roturas marca estado parcial', () => {
  const r = confirmarRecepcion(
    { disponible: 6, enTransito: 4 },
    { disponible: 1, enTransito: 0 },
    3,
    1,
  )
  assert.equal(r.destino.disponible, 4) // 1 previo + 3 recibidas
  assert.equal(r.origen.enTransito, 0) // 4 enviadas liberadas
  assert.equal(r.rotas, 1)
  assert.equal(r.estado, 'parcial')
})

test('confirmar recibidas < enviadas (sin roturas) también es parcial', () => {
  const r = confirmarRecepcion(
    { disponible: 6, enTransito: 4 },
    { disponible: 0, enTransito: 0 },
    3,
    0,
  )
  // solo se confirman 3 de las 4 en tránsito; 1 sigue en tránsito
  assert.equal(r.origen.enTransito, 1)
  assert.equal(r.destino.disponible, 3)
  assert.equal(r.estado, 'parcial')
})

test('confirmar excede lo que hay en tránsito → error', () => {
  assert.throws(() =>
    confirmarRecepcion({ disponible: 6, enTransito: 4 }, { disponible: 0, enTransito: 0 }, 5, 0),
  )
})

test('confirmar nada → error', () => {
  assert.throws(() =>
    confirmarRecepcion({ disponible: 6, enTransito: 4 }, { disponible: 0, enTransito: 0 }, 0, 0),
  )
})

test('cancelar devuelve enTransito a disponible en origen', () => {
  assert.deepEqual(cancelarTraspaso({ disponible: 6, enTransito: 4 }, 4), {
    disponible: 10,
    enTransito: 0,
  })
})

test('cancelar excede lo que hay en tránsito → error', () => {
  assert.throws(() => cancelarTraspaso({ disponible: 6, enTransito: 4 }, 5))
})
