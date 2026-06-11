// Tests de la lógica PURA de la oferta económica (F5).
// Runner integrado de Node (type-stripping): `node --test`.
import { test } from 'node:test'
import assert from 'node:assert/strict'

import { costeTotal, precioMinimoRentable } from '../src/oferta.ts'
import { round2 } from '../src/scoring.ts'
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

import { evaluarOferta } from '../src/oferta.ts'
import type { FichaConcurso } from '../src/types.ts'

function fichaBase(over: Partial<FichaConcurso> = {}): FichaConcurso {
  return {
    objeto: 'x', tipo_contrato: 'servicios', procedimiento: 'abierto', lotes: 0,
    plazos: {}, solvencia: [], garantias: {}, criterios: [], documentos: [],
    ...over,
  }
}

const FICHA_ECON = fichaBase({
  presupuesto_base: 100000,
  criterios: [
    { nombre: 'Precio', puntos: 60, tipo: 'automatico', sobre: 'economico' },
    { nombre: 'Calidad', puntos: 40, tipo: 'juicio_valor', sobre: 'tecnico' },
  ],
})

test('evaluarOferta: margen y viabilidad con coste por debajo de la oferta', () => {
  const e = evaluarOferta(90000, { directos: 70000, indirectos: 10000 }, FICHA_ECON)
  assert.equal(e.coste_total, 80000)
  assert.equal(e.margen_euros, 10000)
  assert.equal(e.margen_pct, round2(10000 / 90000 * 100))
  assert.equal(e.viable, true)
})

test('evaluarOferta: margen negativo => no viable', () => {
  const e = evaluarOferta(70000, { directos: 80000 }, FICHA_ECON)
  assert.equal(e.margen_euros, -10000)
  assert.equal(e.viable, false)
})

test('evaluarOferta: puntos económicos máximos si es la oferta más baja', () => {
  const e = evaluarOferta(80000, { directos: 50000 }, FICHA_ECON, { ofertas: [80000, 90000, 100000] })
  assert.equal(e.puntos_economicos, 60) // proporcional_inversa: la mínima saca el máximo
})

test('evaluarOferta: detecta baja temeraria (1 licitador, 25% bajo presupuesto)', () => {
  // presupuesto 100000 → umbral = 75000; ofertar 70000 es temerario
  const e = evaluarOferta(70000, { directos: 40000 }, FICHA_ECON, { ofertas: [70000] })
  assert.equal(e.umbral_temeraria, 75000)
  assert.equal(e.temeraria, true)
  assert.equal(e.viable, false) // temeraria => no viable aunque haya margen
})

test('evaluarOferta: sin criterio económico => 0 puntos económicos', () => {
  const ficha = fichaBase({ presupuesto_base: 100000, criterios: [{ nombre: 'Calidad', puntos: 100, tipo: 'juicio_valor', sobre: 'tecnico' }] })
  const e = evaluarOferta(90000, { directos: 50000 }, ficha)
  assert.equal(e.puntos_economicos, 0)
})
