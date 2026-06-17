import { test } from 'node:test'
import assert from 'node:assert/strict'
import { generarParte, paxTotal } from '../src/generar.ts'
import type { FichaCatalogo, EventoInput } from '../src/generar.ts'

const catalogo: FichaCatalogo[] = [
  {
    id: 'pollo', nombre: 'Delicia de pollo', partida: 'caliente',
    depende_de: ['SALSA DE MOSTAZA Y MIEL'],
    ingredientes: [
      { nombre: 'pechuga de pollo', por_pax: 120, unidad: 'g', descongelacion: true },
      { nombre: 'mostaza', por_pax: 3, unidad: 'g' },
    ],
    controles: ['termico', 'refrigeracion'], requiere_muestra: true, min_por_pax: 0.5,
  },
  {
    id: 'lomo', nombre: 'Caña de lomo', partida: 'corte',
    ingredientes: [{ nombre: 'caña de lomo', por_pax: 20, unidad: 'g' }],
    controles: ['refrigeracion'], requiere_muestra: true,
  },
  {
    id: 'noservido', nombre: 'Plato no servido', partida: 'frio',
    ingredientes: [{ nombre: 'x', por_pax: 1 }], controles: [],
  },
]

const eventos: EventoInput[] = [
  { id: 'alba', nombre: 'El Alba', pax: 100, fecha_evento: '2026-06-20', elaboraciones: ['pollo', 'lomo'] },
  { id: 'fresnos', nombre: 'Los Fresnos', pax: 50, fecha_evento: '2026-06-20', elaboraciones: ['pollo'] },
]

test('genera una elaboración por ficha servida, ignorando las no servidas', () => {
  const parte = generarParte(catalogo, eventos)
  const ids = parte.elaboraciones.map(e => e.id).sort()
  assert.deepEqual(ids, ['lomo', 'pollo'])
})

test('suma PAX de los eventos que sirven cada elaboración y escala el escandallo', () => {
  const parte = generarParte(catalogo, eventos)
  const pollo = parte.elaboraciones.find(e => e.id === 'pollo')!
  // pollo se sirve en El Alba(100)+Los Fresnos(50)=150 pax → 120 g × 150 = 18000 g = 18 kg
  assert.equal(pollo.ubicaciones.length, 2)
  assert.equal(pollo.ingredientes[0].cantidad, '18 kg')
  // lomo solo en El Alba(100) → 20 g × 100 = 2000 g = 2 kg
  const lomo = parte.elaboraciones.find(e => e.id === 'lomo')!
  assert.equal(lomo.ingredientes[0].cantidad, '2 kg')
})

test('asigna los controles de la ficha sin registrar (valor null) y conserva depende_de', () => {
  const parte = generarParte(catalogo, eventos)
  const pollo = parte.elaboraciones.find(e => e.id === 'pollo')!
  assert.deepEqual(pollo.controles.map(c => c.tipo), ['termico', 'refrigeracion'])
  assert.equal(pollo.controles[0].valor, null)
  assert.deepEqual(pollo.depende_de, ['SALSA DE MOSTAZA Y MIEL'])
})

test('marca muestra_testigo según la ficha (null si requiere, false si no)', () => {
  const parte = generarParte(catalogo, eventos)
  const pollo = parte.elaboraciones.find(e => e.id === 'pollo')!
  assert.equal(pollo.muestra_testigo, null) // requiere_muestra: true → pendiente
})

test('lote y proveedor quedan en blanco para rellenar en recepción', () => {
  const parte = generarParte(catalogo, eventos)
  const pollo = parte.elaboraciones.find(e => e.id === 'pollo')!
  assert.equal(pollo.ingredientes[0].lote, '')
  assert.equal(pollo.ingredientes[0].proveedor, '')
})

test('cantidades pequeñas se quedan en g/ml; grandes pasan a kg/L', () => {
  const parte = generarParte(catalogo, eventos)
  const pollo = parte.elaboraciones.find(e => e.id === 'pollo')!
  // mostaza 3 g × 150 = 450 g → se queda en g
  assert.equal(pollo.ingredientes[1].cantidad, '450 g')
})

test('paxTotal suma los eventos del parte', () => {
  const parte = generarParte(catalogo, eventos)
  assert.equal(paxTotal(parte), 150)
})
