import { test } from 'node:test'
import assert from 'node:assert/strict'

import type { NivelPatrimonio } from '@central/module-patrimonio'

import {
  eurosACentimos,
  responderAltaComunidad,
  responderAltaDerrama,
  responderAltaPlantilla,
  responderListaGastos,
  type AccesosMapa,
  type PuertosGastos,
} from './gastos-api.ts'

const MIO = '11111111-1111-1111-1111-111111111111'
const GESTION = '22222222-2222-2222-2222-222222222222'
const AJENO = '33333333-3333-3333-3333-333333333333'
const INM = '44444444-4444-4444-4444-444444444444'
const COM = '55555555-5555-5555-5555-555555555555'

const plantilla = (titular: unknown, extra: Record<string, unknown> = {}) => ({
  titular, concepto: 'Cuota comunidad', categoria: 'COMUNIDAD', periodicidad: 'mensual', diaMes: 5, inicio: '2026-01-01', importeCent: 12000, inmueble: INM, ...extra,
})
const derrama = (titular: unknown, extra: Record<string, unknown> = {}) => ({
  titular, comunidad: COM, inmueble: INM, concepto: 'Fachada', totalCent: 100000, cuotas: 4, primera: '2026-11-01', ...extra,
})
const comunidad = (titular: unknown, extra: Record<string, unknown> = {}) => ({ titular, nombre: 'Comunidad Socorro 24', inmuebles: [{ inmueble: INM, coeficiente: 3.5 }], ...extra })

function puertos(accesos: AccesosMapa, crear: 'ok' | 'no_encontrado' = 'ok') {
  const llamadas = { listar: [] as string[][], plantilla: [] as unknown[], comunidad: [] as unknown[], derrama: [] as unknown[] }
  const res = () => (crear === 'ok' ? ({ ok: true, id: 'nuevo' } as const) : ({ ok: false, motivo: 'no_encontrado' } as const))
  const p: PuertosGastos = {
    accesos: async () => accesos,
    listar: async (ids) => { llamadas.listar.push([...ids]); return [] },
    crearPlantilla: async (x) => { llamadas.plantilla.push(x); return res() },
    crearComunidad: async (x) => { llamadas.comunidad.push(x); return res() },
    crearDerrama: async (x) => { llamadas.derrama.push(x); return res() },
  }
  return { p, llamadas }
}
const mapa = (e: [string, NivelPatrimonio][]) => new Map(e)

test('sin acceso: lista vacía y las tres altas = 404 sin tocar la BD', async () => {
  const { p, llamadas } = puertos(mapa([]))
  assert.deepEqual((await responderListaGastos(p)).body, { titulares: [] })
  assert.deepEqual(llamadas.listar, [])
  for (const r of [await responderAltaPlantilla(p, plantilla(AJENO)), await responderAltaDerrama(p, derrama(AJENO)), await responderAltaComunidad(p, comunidad(AJENO))]) {
    assert.equal(r.status, 404)
  }
  assert.deepEqual([llamadas.plantilla, llamadas.derrama, llamadas.comunidad], [[], [], []])
})

test('plantilla / derrama / comunidad de un titular AJENO: 404 idéntica a «no existe», sin escribir', async () => {
  const { p, llamadas } = puertos(mapa([[MIO, 'total']]))
  for (const alta of [
    (t: unknown) => responderAltaPlantilla(p, plantilla(t)),
    (t: unknown) => responderAltaDerrama(p, derrama(t)),
    (t: unknown) => responderAltaComunidad(p, comunidad(t)),
  ]) {
    const ajeno = await alta(AJENO)
    assert.equal(ajeno.status, 404)
    assert.deepEqual(ajeno, await alta('no-existe'))
    assert.deepEqual(ajeno, await alta(undefined))
  }
  assert.deepEqual([llamadas.plantilla, llamadas.derrama, llamadas.comunidad], [[], [], []])
})

test('nivel sin permiso: Gestión no crea comunidad (alta_baja) = 404; sí plantilla y derrama', async () => {
  const { p, llamadas } = puertos(mapa([[GESTION, 'gestion']]))
  assert.equal((await responderAltaComunidad(p, comunidad(GESTION))).status, 404)
  assert.deepEqual(llamadas.comunidad, [])
  assert.equal((await responderAltaPlantilla(p, plantilla(GESTION))).status, 201)
  assert.equal((await responderAltaDerrama(p, derrama(GESTION))).status, 201)
})

test('lo que el puerto no encuentra DENTRO del titular (inmueble/comunidad ajenos) también es 404', async () => {
  const { p } = puertos(mapa([[MIO, 'total']]), 'no_encontrado')
  assert.equal((await responderAltaPlantilla(p, plantilla(MIO))).status, 404)
  assert.equal((await responderAltaDerrama(p, derrama(MIO))).status, 404)
  assert.equal((await responderAltaComunidad(p, comunidad(MIO))).status, 404)
})

test('el servidor decide el titular: titularId/correduriaId del cuerpo no cuentan', async () => {
  const { p, llamadas } = puertos(mapa([[MIO, 'total']]))
  await responderAltaPlantilla(p, plantilla(MIO, { titularId: AJENO, titular_id: AJENO, correduriaId: AJENO }))
  const x = llamadas.plantilla[0] as { clienteId: string; datos: Record<string, unknown> }
  assert.equal(x.clienteId, MIO)
  assert.equal('titularId' in x.datos, false)
})

test('importe: vacío/null = variable (null), nunca 0; 0 o negativo = inválido', async () => {
  const { p, llamadas } = puertos(mapa([[MIO, 'total']]))
  assert.equal((await responderAltaPlantilla(p, plantilla(MIO, { importeCent: null }))).status, 201)
  assert.equal((llamadas.plantilla[0] as { datos: { importeCent: unknown } }).datos.importeCent, null)
  for (const malo of [0, -5, 1.5, '12']) {
    const r = await responderAltaPlantilla(p, plantilla(MIO, { importeCent: malo }))
    assert.equal(r.status, 400)
    assert.deepEqual(r.body, { error: 'datos_invalidos', campo: 'importe' })
  }
  // La derrama exige total.
  assert.equal((await responderAltaDerrama(p, derrama(MIO, { totalCent: null }))).status, 400)
  assert.equal(eurosACentimos(''), null)
  assert.equal(eurosACentimos('1.234,56'), 123456)
  assert.equal(eurosACentimos('0'), 'invalido')
})

test('validaciones de forma: fecha real, fin ≥ inicio, día 1-31, cuotas 1-120, comunidad sin inmueble', async () => {
  const { p } = puertos(mapa([[MIO, 'total']]))
  const campo = async (r: Promise<{ body: Record<string, unknown> }>) => (await r).body.campo
  assert.equal(await campo(responderAltaPlantilla(p, plantilla(MIO, { inicio: '2026-02-30' }))), 'inicio')
  assert.equal(await campo(responderAltaPlantilla(p, plantilla(MIO, { fin: '2025-12-31' }))), 'fin')
  assert.equal(await campo(responderAltaPlantilla(p, plantilla(MIO, { diaMes: 32 }))), 'diaMes')
  assert.equal(await campo(responderAltaPlantilla(p, plantilla(MIO, { inmueble: null, comunidad: COM }))), 'comunidad')
  assert.equal(await campo(responderAltaDerrama(p, derrama(MIO, { cuotas: 0 }))), 'cuotas')
  assert.equal(await campo(responderAltaDerrama(p, derrama(MIO, { cuotas: 121 }))), 'cuotas')
  assert.equal(await campo(responderAltaComunidad(p, comunidad(MIO, { inmuebles: [{ inmueble: INM, coeficiente: 0 }] }))), 'coeficiente')
})

test('coeficiente vacío = no consta (null), no 0', async () => {
  const { p, llamadas } = puertos(mapa([[MIO, 'total']]))
  await responderAltaComunidad(p, comunidad(MIO, { inmuebles: [{ inmueble: INM, coeficiente: null }] }))
  const x = llamadas.comunidad[0] as { datos: { inmuebles: { coeficiente: unknown }[] } }
  assert.equal(x.datos.inmuebles[0].coeficiente, null)
})
