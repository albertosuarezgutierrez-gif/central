// Aislamiento y reglas de las OBLIGACIONES PROPIAS del inmueble (25/10/2026), con puertos falsos y `hoy` inyectado.
import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  CategoriaNoDisponible,
  esRechazoDelCatalogo,
  obligacionesDeInmueble,
  responderObligaciones,
  type FilaPropia,
  type InmuebleDeObligaciones,
  type PuertosObligaciones,
} from './obligaciones-api.ts'

const INM = '11111111-1111-4111-8111-111111111111'
const AJENO = '22222222-2222-4222-8222-222222222222'
const O1 = '33333333-3333-4333-8333-333333333333'
const O_AJENA = '44444444-4444-4444-8444-444444444444'
const HOY = '2026-10-25'

const fila = (x: Partial<FilaPropia> = {}): FilaPropia => ({ id: O1, categoria: 'ibi', vence: '2026-11-10', periodicidadMeses: 12, descripcion: null, ...x })

function puertos(o: { inm?: InmuebleDeObligaciones | null; filas?: FilaPropia[] } = {}) {
  const inm = o.inm === undefined ? { id: INM, nivel: 'gestion' as const, archivado: false } : o.inm
  const filas = o.filas ?? [fila()]
  const escritos: unknown[] = []
  const p: PuertosObligaciones = {
    async inmueble(id) { return id === INM ? inm : null },
    async propias(inmuebleId) { return inmuebleId === INM ? filas : [] },
    async crear(inmuebleId, v) { escritos.push(['crear', inmuebleId, v]) },
    async actualizar(inmuebleId, id, v) { escritos.push(['actualizar', inmuebleId, id, v]); return id === O1 },
    async avanzar(inmuebleId, id, vence, hechaEn) { escritos.push(['avanzar', inmuebleId, id, vence, hechaEn]); return id === O1 },
    async archivar(inmuebleId, id) { escritos.push(['archivar', inmuebleId, id]); return id === O1 },
  }
  return { p, escritos }
}
const buen = { accion: 'crear', categoria: 'caldera', vence: '2027-03-01', periodicidad: 'anual', descripcion: 'Revisión anual' }

test('leer: inmueble ajeno, no uuid o inexistente → null (404); propio → lista ordenada', async () => {
  const { p } = puertos({ filas: [fila({ id: 'b', vence: '2027-01-01' }), fila({ id: 'a', vence: '2026-11-10' })] })
  assert.equal(await obligacionesDeInmueble(p, AJENO), null)
  assert.equal(await obligacionesDeInmueble(p, 'no-uuid'), null)
  assert.equal(await obligacionesDeInmueble(p, 5), null)
  const d = (await obligacionesDeInmueble(p, INM))!
  assert.deepEqual(d.propias.map((x) => x.id), ['a', 'b'])
  assert.equal(d.puedeEditar, true)
})

test('leer: archivado se ve pero no se edita; periodicidad guardada rara → null, no se inventa', async () => {
  const { p } = puertos({ inm: { id: INM, nivel: 'total', archivado: true }, filas: [fila({ periodicidadMeses: 7 })] })
  const d = (await obligacionesDeInmueble(p, INM))!
  assert.equal(d.puedeEditar, false)
  assert.equal(d.propias[0].periodicidad, null)
})

test('crear: gestión y total escriben; el cuerpo no puede cambiar el inmueble', async () => {
  for (const nivel of ['gestion', 'total'] as const) {
    const { p, escritos } = puertos({ inm: { id: INM, nivel, archivado: false } })
    const r = await responderObligaciones(p, INM, { ...buen, inmuebleId: AJENO }, HOY)
    assert.equal(r.status, 201)
    assert.equal((escritos[0] as unknown[])[1], INM)
  }
})

test('🚨 ajeno, inexistente o nivel desconocido: la MISMA 404, sin escribir (nunca 403)', async () => {
  const a = puertos()
  const rAjeno = await responderObligaciones(a.p, AJENO, buen, HOY)
  const rMalId = await responderObligaciones(a.p, 'x', buen, HOY)
  const b = puertos({ inm: { id: INM, nivel: 'administrar' as never, archivado: false } })
  const rNivel = await responderObligaciones(b.p, INM, buen, HOY)
  for (const r of [rAjeno, rMalId, rNivel]) assert.deepEqual(r, { status: 404, body: { error: 'no_encontrado' } })
  assert.equal(a.escritos.length + b.escritos.length, 0)
})

test('🚨 inmueble archivado: solo lectura (409), ninguna acción escribe', async () => {
  const { p, escritos } = puertos({ inm: { id: INM, nivel: 'total', archivado: true } })
  for (const c of [buen, { ...buen, accion: 'editar', obligacionId: O1 }, { accion: 'hecha', obligacionId: O1 }, { accion: 'archivar', obligacionId: O1 }]) {
    const r = await responderObligaciones(p, INM, c, HOY)
    assert.deepEqual(r, { status: 409, body: { error: 'inmueble_archivado' } })
  }
  assert.equal(escritos.length, 0)
})

test('datos inválidos: 400 con su campo y sin escribir', async () => {
  const { p, escritos } = puertos()
  const casos: [unknown, string][] = [
    [{ ...buen, categoria: 'prestamo' }, 'categoria'],
    [{ ...buen, vence: '2026-02-31' }, 'vence'],
    [{ ...buen, periodicidad: 'semanal' }, 'periodicidad'],
    [{ ...buen, categoria: 'otro', descripcion: '' }, 'descripcion'],
    [{ ...buen, accion: 'editar', obligacionId: 'x' }, 'obligacionId'],
    [{ accion: 'borrar' }, 'accion'],
  ]
  for (const [c, campo] of casos) {
    const r = await responderObligaciones(p, INM, c, HOY)
    assert.equal(r.status, 400)
    assert.equal(r.body.campo, campo)
  }
  assert.equal((await responderObligaciones(p, INM, null, HOY)).status, 400)
  assert.equal((await responderObligaciones(p, INM, [], HOY)).status, 400)
  assert.equal(escritos.length, 0)
})

test('tope por inmueble: la 61ª se rechaza', async () => {
  const llenas = Array.from({ length: 60 }, (_, i) => fila({ id: `o${i}` }))
  const { p, escritos } = puertos({ filas: llenas })
  assert.deepEqual(await responderObligaciones(p, INM, buen, HOY), { status: 409, body: { error: 'demasiadas' } })
  assert.equal(escritos.length, 0)
})

test('🚨 editar/archivar una obligación que no es de este inmueble (o no es propia) → 404', async () => {
  const { p } = puertos()
  const e = await responderObligaciones(p, INM, { ...buen, accion: 'editar', obligacionId: O_AJENA }, HOY)
  const a = await responderObligaciones(p, INM, { accion: 'archivar', obligacionId: O_AJENA }, HOY)
  const h = await responderObligaciones(p, INM, { accion: 'hecha', obligacionId: O_AJENA }, HOY)
  for (const r of [e, a, h]) assert.deepEqual(r, { status: 404, body: { error: 'no_encontrado' } })
})

test('hecha: recurrente avanza desde la fecha original; única se archiva', async () => {
  const rec = puertos({ filas: [fila({ vence: '2026-10-20', periodicidadMeses: 12 })] })
  const r = await responderObligaciones(rec.p, INM, { accion: 'hecha', obligacionId: O1 }, HOY)
  assert.deepEqual(r, { status: 200, body: { ok: true, vence: '2027-10-20' } })
  assert.deepEqual(rec.escritos, [['avanzar', INM, O1, '2027-10-20', HOY]])
  const uni = puertos({ filas: [fila({ periodicidadMeses: null })] })
  assert.deepEqual(await responderObligaciones(uni.p, INM, { accion: 'hecha', obligacionId: O1 }, HOY), { status: 200, body: { ok: true, archivada: true } })
  assert.deepEqual(uni.escritos, [['archivar', INM, O1]])
})

test('hecha: sin fecha o con periodicidad desconocida NO se adivina (409, sin escribir)', async () => {
  const a = puertos({ filas: [fila({ vence: null })] })
  assert.deepEqual(await responderObligaciones(a.p, INM, { accion: 'hecha', obligacionId: O1 }, HOY), { status: 409, body: { error: 'sin_fecha' } })
  const b = puertos({ filas: [fila({ periodicidadMeses: 7 })] })
  assert.deepEqual(await responderObligaciones(b.p, INM, { accion: 'hecha', obligacionId: O1 }, HOY), { status: 409, body: { error: 'periodicidad_desconocida' } })
  assert.equal(a.escritos.length + b.escritos.length, 0)
})

test('editar y archivar propias del inmueble: 200', async () => {
  const { p, escritos } = puertos()
  assert.equal((await responderObligaciones(p, INM, { ...buen, accion: 'editar', obligacionId: O1 }, HOY)).status, 200)
  assert.equal((await responderObligaciones(p, INM, { accion: 'archivar', obligacionId: O1 }, HOY)).status, 200)
  assert.equal(escritos.length, 2)
})

test('hipoteca (27/10/2026): se crea y se edita como cualquier categoría', async () => {
  const { p, escritos } = puertos()
  const hip = { ...buen, categoria: 'hipoteca', periodicidad: 'mensual', descripcion: undefined }
  assert.equal((await responderObligaciones(p, INM, hip, HOY)).status, 201)
  assert.equal((await responderObligaciones(p, INM, { ...hip, accion: 'editar', obligacionId: O1 }, HOY)).status, 200)
  assert.equal(escritos.length, 2)
})

test('🚨 la BD aún no admite la categoría (CHECK viejo): 409 categoria_no_disponible, nunca 500; otro fallo sigue siendo fallo', async () => {
  const { p } = puertos()
  const rechaza: PuertosObligaciones = {
    ...p,
    async crear() { throw new CategoriaNoDisponible() },
    async actualizar() { throw new CategoriaNoDisponible() },
  }
  const hip = { ...buen, categoria: 'hipoteca', periodicidad: 'mensual' }
  const esperado = { status: 409, body: { error: 'categoria_no_disponible' } }
  assert.deepEqual(await responderObligaciones(rechaza, INM, hip, HOY), esperado)
  assert.deepEqual(await responderObligaciones(rechaza, INM, { ...hip, accion: 'editar', obligacionId: O1 }, HOY), esperado)
  const rota: PuertosObligaciones = { ...p, async crear() { throw new Error('conexion_perdida') } }
  await assert.rejects(responderObligaciones(rota, INM, hip, HOY), /conexion_perdida/)
})

test('esRechazoDelCatalogo: solo el CHECK del catálogo (viejo o _v2), por mensaje o meta', () => {
  const pg = 'new row for relation "portal_patrimonio_obligacion" violates check constraint "portal_patrimonio_obligacion_categoria_catalogo"'
  assert.equal(esRechazoDelCatalogo(new Error(pg)), true)
  assert.equal(esRechazoDelCatalogo({ message: 'P2004', meta: { database_error: pg.replace('catalogo"', 'catalogo_v2"') } }), true)
  for (const e of [
    new Error('violates check constraint "portal_patrimonio_obligacion_propia_coherente"'),
    new Error('connection refused'),
    null,
    'portal_patrimonio_obligacion_categoria_catalogo',
  ]) assert.equal(esRechazoDelCatalogo(e), false, String(e))
})
