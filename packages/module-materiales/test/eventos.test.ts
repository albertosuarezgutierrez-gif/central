// Tests de la lógica pura del ciclo de eventos/alquileres.
import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  reservar, cancelarReserva, entregar, devolver, enPropiedad, solapa,
  type CeldaEvento,
} from '../src/eventos.ts'

const celda = (over: Partial<CeldaEvento> = {}): CeldaEvento => ({
  disponible: 0, reservado: 0, enTransito: 0, fuera: 0, ...over,
})

test('reservar mueve disponible → reservado', () => {
  assert.deepEqual(reservar(celda({ disponible: 10 }), 4), celda({ disponible: 6, reservado: 4 }))
})

test('reservar no permite más de lo disponible', () => {
  assert.throws(() => reservar(celda({ disponible: 3 }), 4))
})

test('cancelarReserva devuelve reservado → disponible', () => {
  assert.deepEqual(cancelarReserva(celda({ disponible: 6, reservado: 4 }), 4), celda({ disponible: 10 }))
})

test('entregar mueve reservado → fuera', () => {
  assert.deepEqual(entregar(celda({ reservado: 4 }), 4), celda({ fuera: 4 }))
})

test('entregar no permite más de lo reservado', () => {
  assert.throws(() => entregar(celda({ reservado: 2 }), 3))
})

test('devolver: buenas vuelven a disponible, rotas se pierden', () => {
  const r = devolver(celda({ fuera: 4, disponible: 1 }), 3, 1)
  assert.deepEqual(r.celda, celda({ fuera: 0, disponible: 4 }))
  assert.equal(r.rotas, 1)
})

test('devolver excede lo que hay fuera → error', () => {
  assert.throws(() => devolver(celda({ fuera: 2 }), 2, 1))
})

test('devolver nada → error', () => {
  assert.throws(() => devolver(celda({ fuera: 2 }), 0, 0))
})

test('enPropiedad suma todos los estados', () => {
  assert.equal(enPropiedad(celda({ disponible: 2, reservado: 3, enTransito: 1, fuera: 4 })), 10)
})

test('enPropiedad baja tras una rotura (devolución con rotas)', () => {
  const antes = celda({ fuera: 5 })
  assert.equal(enPropiedad(antes), 5)
  const { celda: despues } = devolver(antes, 3, 2)
  assert.equal(enPropiedad(despues), 3) // 2 rotas perdidas
})

test('solapa detecta rangos que se cruzan y descarta los disjuntos', () => {
  assert.equal(solapa('2026-04-10', '2026-04-12', '2026-04-11', '2026-04-15'), true)
  assert.equal(solapa('2026-04-10', '2026-04-12', '2026-04-13', '2026-04-15'), false)
  assert.equal(solapa('2026-04-10', '2026-04-12', '2026-04-12', '2026-04-15'), true) // borde inclusivo
})
