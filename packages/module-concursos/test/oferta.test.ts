// Tests de la lógica PURA de la oferta económica (F5).
// Runner integrado de Node (type-stripping): `node --test`.
import { test } from 'node:test'
import assert from 'node:assert/strict'

import { costeTotal, precioMinimoRentable } from '../src/oferta.ts'
import type { CosteEjecucion } from '../src/types.ts'

test('costeTotal: suma directos + indirectos', () => {
  assert.equal(costeTotal({ directos: 1000 }), 1000)
  assert.equal(costeTotal({ directos: 1000, indirectos: 250 }), 1250)
})

test('precioMinimoRentable: sin margen objetivo = coste (umbral de equilibrio)', () => {
  assert.equal(precioMinimoRentable({ directos: 1000, indirectos: 200 }), 1200)
})

test('precioMinimoRentable: con margen objetivo sube el precio (margen sobre precio)', () => {
  // coste 800, margen 20% sobre precio → precio = 800 / (1 - 0.20) = 1000
  assert.equal(precioMinimoRentable({ directos: 800, margen_objetivo_pct: 20 }), 1000)
})

test('precioMinimoRentable: margen >= 100% se trata como coste (evita dividir por 0)', () => {
  assert.equal(precioMinimoRentable({ directos: 500, margen_objetivo_pct: 100 }), 500)
})
