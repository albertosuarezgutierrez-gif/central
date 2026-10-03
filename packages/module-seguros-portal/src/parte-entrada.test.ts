// Cepo del camino ÚNICO del parte: desde una póliza → el teléfono de SU compañía →
// el parte de esa póliza. Lee la cabecera de `parte-entrada.ts`.

import assert from 'node:assert/strict'
import test from 'node:test'

import { canalDeCompania, type FilaCompania } from './canal-compania.ts'
import { entradaValida, vistaDelParte, type OpcionEntradaParte } from './parte-entrada.ts'

const fila = (nombre: string, tel: string): FilaCompania => ({
  nombreComun: nombre,
  telefonoSiniestros: tel,
  asistencias: [],
  whatsappSiniestros: null,
  whatsappNota: null,
  horarioSiniestros: null,
  verificadoEn: '2026-09-23',
})
const CATALOGO = [fila('Occident', '900 000 001'), fila('Reale', '900 000 002'), fila('Mapfre', '900 000 003')]

const op = (valor: string, compania: string | null, puedeParte: boolean): OpcionEntradaParte => ({
  valor,
  canal: canalDeCompania(compania, CATALOGO),
  puedeParte,
})

// La cartera de Alberto: una propia (Mapfre), la de hogar de su padre sin alcance de
// partes (Occident), una ajena con alcance (Reale) y una aportada con un nombre
// que no casa con el catálogo.
const OPCIONES = [
  op('cartera:propia', 'Mapfre', true),
  op('cartera:ajena-sin', 'Occident', false),
  op('cartera:ajena-con', 'Reale', true),
  op('declarada:rara', 'MAPFRE ESPAÑA S.A.', true),
]

test('póliza PROPIA: solo su compañía delante, parte permitido, las demás aparte', () => {
  const v = vistaDelParte(OPCIONES, 'cartera:propia')
  assert.equal(v.modo, 'poliza')
  if (v.modo !== 'poliza') return
  assert.equal(v.principal.nombre, 'Mapfre')
  assert.equal(v.puedeParte, true)
  assert.ok(!v.otras.some((c) => c.nombre === 'Mapfre'), 'la principal no se repite en «otras»')
})

test('póliza AJENA CON alcance: el mismo camino que una propia', () => {
  const v = vistaDelParte(OPCIONES, 'cartera:ajena-con')
  assert.equal(v.modo, 'poliza')
  if (v.modo !== 'poliza') return
  assert.equal(v.principal.nombre, 'Reale')
  assert.equal(v.puedeParte, true)
})

test('póliza AJENA SIN alcance (el caso de Alberto): su compañía, pero sin parte', () => {
  const v = vistaDelParte(OPCIONES, 'cartera:ajena-sin')
  assert.equal(v.modo, 'poliza')
  if (v.modo !== 'poliza') return
  assert.equal(v.principal.nombre, 'Occident')
  assert.equal(v.principal.sinDatos, false)
  assert.equal(v.puedeParte, false, 'sin alcance no se ofrece el parte (la ruta devolvería 403)')
  assert.ok(!v.otras.some((c) => c.nombre === 'Occident'))
})

test('compañía que NO casa con el catálogo: «sin datos», nunca otra compañía ni la lista entera delante', () => {
  const v = vistaDelParte(OPCIONES, 'declarada:rara')
  assert.equal(v.modo, 'poliza')
  if (v.modo !== 'poliza') return
  assert.equal(v.principal.sinDatos, true)
  assert.equal(v.principal.nombre, 'MAPFRE ESPAÑA S.A.')
  assert.deepEqual(v.principal.vias, [], 'nunca el teléfono de la Mapfre del catálogo por parecido')
})

test('compañía en blanco: sin datos, y nada se promueve en su lugar', () => {
  const v = vistaDelParte([...OPCIONES, op('declarada:sin', null, true)], 'declarada:sin')
  assert.equal(v.modo, 'poliza')
  if (v.modo !== 'poliza') return
  assert.equal(v.principal.sinDatos, true)
  assert.equal(v.principal.nombre, '')
})

test('sin póliza, o con un ?poliza= que no está en la lista: primero elegir, compañías plegadas', () => {
  for (const e of [null, undefined, '', 'cartera:de-un-desconocido']) {
    const v = vistaDelParte(OPCIONES, e)
    assert.equal(v.modo, 'elegir', `entrada ${String(e)}`)
    // Plegar no es borrar: siguen todas, sin duplicados.
    assert.equal(v.otras.length, 4)
  }
  assert.equal(entradaValida(OPCIONES, 'cartera:de-un-desconocido'), null)
  assert.equal(entradaValida(OPCIONES, 'cartera:ajena-sin'), 'cartera:ajena-sin')
})
