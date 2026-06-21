import { test } from 'node:test'
import assert from 'node:assert/strict'
import { alergenosIncompatibles, avisosDietas } from '../src/dietas.ts'
import type { FichaCatalogo, EventoInput } from '../src/generar.ts'

const catalogo: FichaCatalogo[] = [
  { id: 'tarta', nombre: 'Tarta de la abuela', partida: 'frio',
    ingredientes: [{ nombre: 'harina', por_pax: 60, unidad: 'g' }, { nombre: 'huevo', por_pax: 1, unidad: 'u' }],
    controles: [] },
  { id: 'ensalada', nombre: 'Ensalada de la huerta', partida: 'frio',
    ingredientes: [{ nombre: 'lechuga', por_pax: 80, unidad: 'g' }, { nombre: 'tomate', por_pax: 50, unidad: 'g' }],
    controles: [] },
]

test('alergenosIncompatibles mapea las dietas comunes', () => {
  assert.deepEqual(alergenosIncompatibles('sin gluten'), ['gluten'])
  assert.deepEqual(alergenosIncompatibles('Sin Lactosa'), ['lacteos'])
  assert.ok(alergenosIncompatibles('vegano').includes('huevos'))
  assert.ok(alergenosIncompatibles('alérgico a frutos secos').includes('frutos_cascara'))
})

test('avisa cuando el plato de la dieta contiene un alérgeno incompatible', () => {
  const eventos: EventoInput[] = [
    { id: 'boda', nombre: 'Boda Pérez', pax: 150, fecha_evento: '2026-06-20', elaboraciones: ['ensalada'],
      dietas: [{ receta_id: 'tarta', dieta: 'sin gluten', comensales: 5 }] },
  ]
  const avisos = avisosDietas(eventos, catalogo)
  const incompat = avisos.find(a => a.tipo === 'alergeno_incompatible')!
  assert.ok(incompat, 'la tarta lleva harina → gluten, incompatible con sin gluten')
  assert.deepEqual(incompat.alergenos, ['gluten'])
})

test('no avisa si el plato de la dieta es compatible', () => {
  const eventos: EventoInput[] = [
    { id: 'boda', nombre: 'Boda Pérez', pax: 150, fecha_evento: '2026-06-20', elaboraciones: ['tarta'],
      dietas: [{ receta_id: 'ensalada', dieta: 'sin gluten', comensales: 5 }] },
  ]
  const avisos = avisosDietas(eventos, catalogo)
  assert.equal(avisos.filter(a => a.tipo === 'alergeno_incompatible').length, 0)
})

test('avisa cuando los comensales de una dieta superan el PAX del evento', () => {
  const eventos: EventoInput[] = [
    { id: 'mini', nombre: 'Comida íntima', pax: 4, fecha_evento: '2026-06-20', elaboraciones: ['ensalada'],
      dietas: [{ receta_id: 'ensalada', dieta: 'vegano', comensales: 10 }] },
  ]
  const avisos = avisosDietas(eventos, catalogo)
  assert.ok(avisos.some(a => a.tipo === 'comensales_exceden_pax'))
})
