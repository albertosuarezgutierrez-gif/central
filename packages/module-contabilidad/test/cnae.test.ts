// CNAE → plantilla sugerida (pedido de Alberto 05/11/2026). La app SUGIERE; el dueño/gestor confirma o cambia.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  plantillaSugeridaPorCnae, sugerenciaPorCnae, normalizarCnae, CNAE_ACTIVIDADES, SECTORES_PLANTILLA, dimensionesPorCnae, plantillaDe,
  avisosPrioritarios, ordenarAvisosPorRelevancia, actividadesConocidas,
} from '../src/index.ts'

const ESPERADO: Record<string, string[]> = {
  taller: ['4520', '4531', '4532'],
  hosteleria: ['5610', '5621', '5629', '5630'],
  limpieza: ['8121', '8122', '8129'],
  alquiler: ['6820', '7711', '7712', '7721', '7729', '7732', '7739'],
}

test('cada CNAE pedido por Alberto sugiere SU plantilla', () => {
  for (const [sector, codigos] of Object.entries(ESPERADO)) for (const c of codigos) assert.equal(plantillaSugeridaPorCnae(c), sector, c)
})

test('la tabla no tiene más CNAE que los pedidos y todos apuntan a una plantilla que existe', () => {
  assert.deepEqual(Object.keys(CNAE_ACTIVIDADES).sort(), Object.values(ESPERADO).flat().sort())
  for (const f of Object.values(CNAE_ACTIVIDADES)) assert.ok((SECTORES_PLANTILLA as readonly string[]).includes(f.sector))
  assert.equal(actividadesConocidas().length, Object.keys(CNAE_ACTIVIDADES).length)
})

test('CNAE desconocido, inválido o ausente → genérico (nunca se inventa un sector)', () => {
  for (const v of ['9999', '6201', '1234', 'abc', '45', '0452', '', '   ', null, undefined, 4520.5, {}]) assert.equal(plantillaSugeridaPorCnae(v), 'generico', String(v))
  assert.equal(sugerenciaPorCnae('6201').motivo, 'cnae_sin_plantilla')
  assert.equal(sugerenciaPorCnae('abc').motivo, 'cnae_invalido')
  assert.equal(sugerenciaPorCnae(null).motivo, 'sin_cnae')
  assert.equal(sugerenciaPorCnae('4520').motivo, 'cnae_conocido')
})

test('formas con las que lo teclea una persona', () => {
  for (const v of ['45.20', '4520', ' 45 20 ', '4520Z', '45.20.1']) assert.equal(normalizarCnae(v), '4520', v)
  assert.equal(plantillaSugeridaPorCnae('56.30'), 'hosteleria')
  assert.equal(normalizarCnae('452'), null)
})

test('los ejes de rentabilidad se acotan por la actividad, sin inventar ninguno ni vaciar la lista', () => {
  const claves = (s: string, c: unknown) => dimensionesPorCnae(s, c).map((d) => d.clave)
  assert.deepEqual(claves('taller', '4520'), ['ot', 'cliente', 'tipo_trabajo', 'mecanico', 'proveedor'])
  assert.deepEqual(claves('taller', '4532'), ['cliente', 'proveedor']) // un comercio de recambios no tiene mecánico ni OT
  assert.deepEqual(claves('hosteleria', '5621'), ['producto', 'franja'])
  // sin CNAE o con una plantilla distinta de la sugerida: todos los de la plantilla elegida
  assert.deepEqual(claves('taller', null), plantillaDe('taller').dimensiones.map((d) => d.clave))
  assert.deepEqual(claves('limpieza', '4532'), plantillaDe('limpieza').dimensiones.map((d) => d.clave))
  for (const [c, f] of Object.entries(CNAE_ACTIVIDADES)) {
    const todas = plantillaDe(f.sector).dimensiones.map((d) => d.clave)
    for (const e of f.ejes) assert.ok(todas.includes(e), `${c}: el eje ${e} no existe en la plantilla ${f.sector}`)
    assert.ok(claves(f.sector, c).length > 0)
  }
})

test('avisos: se priorizan los de la actividad y NINGUNO se descarta (orden estable)', () => {
  const avisos = [{ tipo: 'fiscal', n: 1 }, { tipo: 'tesoreria', n: 2 }, { tipo: 'efectivo', n: 3 }, { tipo: 'margen', n: 4 }, { tipo: 'efectivo', n: 5 }]
  assert.deepEqual(avisosPrioritarios('hosteleria', '5630'), ['efectivo', 'margen', 'tesoreria'])
  const o = ordenarAvisosPorRelevancia(avisos, 'hosteleria', '5630')
  assert.deepEqual(o.map((a) => a.n), [3, 5, 4, 2, 1])
  assert.equal(o.length, avisos.length)
  assert.deepEqual(ordenarAvisosPorRelevancia(avisos, 'generico', null).map((a) => a.n), [1, 2, 3, 4, 5])
})
