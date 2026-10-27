import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  ALIAS_GENERALES, GENERAL, agruparPorInmueble, eleccionDeInmueble, gruposDeInmueble, inmuebleInicial,
  pendientesDeInicio, textoInmueblesInicio, textoPendientesInicio, titularDeInmueble,
} from './gastos-vista.ts'
import type { TitularGastos } from './gastos-api.ts'

const A = { id: 'a', alias: 'Socorro 24' }
const B = { id: 'b', alias: 'Bustos Tavera 22' }

// (a) default del inmueble al añadir un gasto
test('un único inmueble viene preseleccionado', () => {
  assert.equal(inmuebleInicial([A]), 'a')
  assert.deepEqual(eleccionDeInmueble([A], inmuebleInicial([A])), { ok: true, inmueble: 'a' })
})
test('varios inmuebles: sin elegir NO vale (nunca «sin inmueble» por defecto)', () => {
  assert.equal(inmuebleInicial([A, B]), '')
  assert.deepEqual(eleccionDeInmueble([A, B], ''), { ok: false })
  assert.deepEqual(eleccionDeInmueble([A, B], 'b'), { ok: true, inmueble: 'b' })
})
test('«general» solo si se elige explícitamente; un id ajeno no vale', () => {
  assert.deepEqual(eleccionDeInmueble([A, B], GENERAL), { ok: true, inmueble: null })
  assert.deepEqual(eleccionDeInmueble([A, B], 'otro-titular'), { ok: false })
})
test('titular sin inmuebles: solo cabe el gasto general', () => {
  assert.equal(inmuebleInicial([]), GENERAL)
  assert.deepEqual(eleccionDeInmueble([], ''), { ok: true, inmueble: null })
})
test('inmueble prefijado (ficha del piso): gana si es del titular, si no se ignora', () => {
  assert.equal(inmuebleInicial([A, B], 'b'), 'b')
  assert.equal(inmuebleInicial([A, B], 'zzz'), '')
})

// (b) agrupación por inmueble con generales
const plantilla = (id: string, inmuebleId: string | null) => ({
  id, inmuebleId, inmuebleAlias: null, concepto: id, categoria: 'COMUNIDAD', periodicidad: 'mensual', diaMes: 1, inicio: '2026-01-01', fin: null, importeCent: 100, proveedor: null, activo: true,
})
const gasto = (id: string, inmuebleId: string | null, estado: 'propuesto' | 'confirmado' = 'propuesto') => ({
  id, inmuebleId, fecha: '2026-10-01', concepto: id, categoria: null, totalCent: null, estado, origen: 'plantilla',
})
const titular = (extra: Partial<TitularGastos> = {}): TitularGastos => ({
  clienteId: 'c', nombre: 'T', nivel: 'total', propio: true, puedeGestionar: true, puedeEstructura: true,
  inmuebles: [A, B], plantillas: [], comunidades: [], derramas: [], gastos: [], facturasPendientes: [], ...extra,
})

test('agrupa por inmueble y manda lo huérfano a «Generales del titular»', () => {
  const t = titular({
    plantillas: [plantilla('p1', 'a'), plantilla('p2', null), plantilla('p3', 'archivado')],
    gastos: [gasto('g1', 'b'), gasto('g2', null)],
    comunidades: [
      { id: 'c1', nombre: 'Com', administradorNombre: null, inmuebles: [{ inmuebleId: 'a', alias: A.alias, coeficiente: null }, { inmuebleId: 'b', alias: B.alias, coeficiente: 2 }] },
      { id: 'c2', nombre: 'Sin enlaces', administradorNombre: null, inmuebles: [] },
    ],
  })
  const g = agruparPorInmueble(t)
  assert.deepEqual(g.map((x) => x.alias), [A.alias, B.alias, ALIAS_GENERALES])
  assert.deepEqual(g[0]!.plantillas.map((p) => p.id), ['p1'])
  assert.deepEqual(g[0]!.comunidades.map((c) => c.id), ['c1'])
  assert.deepEqual(g[1]!.comunidades.map((c) => c.id), ['c1'])
  assert.deepEqual(g[1]!.gastos.map((x) => x.id), ['g1'])
  assert.equal(g[2]!.inmuebleId, null)
  assert.deepEqual(g[2]!.plantillas.map((p) => p.id), ['p2', 'p3'])
  assert.deepEqual(g[2]!.comunidades.map((c) => c.id), ['c2'])
})
test('sin gastos huérfanos no hay grupo de generales; los pisos sin nada siguen saliendo', () => {
  const g = agruparPorInmueble(titular({ plantillas: [plantilla('p1', 'a')] }))
  assert.deepEqual(g.map((x) => x.inmuebleId), ['a', 'b'])
})
test('ficha del piso: solo lo de ese inmueble; titularDeInmueble no arrastra otros pisos ni generales', () => {
  const t = titular({ plantillas: [plantilla('p1', 'a'), plantilla('p2', 'b'), plantilla('p3', null)] })
  assert.deepEqual(gruposDeInmueble(t, 'a').plantillas.map((p) => p.id), ['p1'])
  const r = titularDeInmueble(t, 'b')
  assert.deepEqual(r.plantillas.map((p) => p.id), ['p2'])
  assert.deepEqual(r.inmuebles, [B])
  assert.equal(r.puedeGestionar, true)
})

// (c) contador de Inicio: null ≠ 0
test('Inicio: null = no se sabe (no se pinta 0); 0 = revisado', () => {
  assert.deepEqual(pendientesDeInicio(null), { tipo: 'sin_comprobar' })
  assert.deepEqual(pendientesDeInicio(undefined), { tipo: 'sin_comprobar' })
  assert.deepEqual(pendientesDeInicio(0), { tipo: 'ninguno' })
  assert.deepEqual(pendientesDeInicio(3), { tipo: 'hay', n: 3 })
  assert.doesNotMatch(textoPendientesInicio(null), /\b0\b|No tienes/)
  assert.match(textoPendientesInicio(null), /no hemos podido comprobar/i)
  assert.equal(textoPendientesInicio(0), 'No tienes gastos por confirmar.')
  assert.equal(textoPendientesInicio(1), '1 gasto por confirmar.')
  assert.equal(textoPendientesInicio(4), '4 gastos por confirmar.')
})
test('Inicio: nº de inmuebles null no se pinta como 0', () => {
  assert.equal(textoInmueblesInicio(null), null)
  assert.equal(textoInmueblesInicio(0), '0 inmuebles')
  assert.equal(textoInmueblesInicio(1), '1 inmueble')
  assert.equal(textoInmueblesInicio(12), '12 inmuebles')
})
