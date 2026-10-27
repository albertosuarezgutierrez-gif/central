import { test } from 'node:test'
import assert from 'node:assert/strict'

import type { NivelPatrimonio } from '@central/module-patrimonio'

import { responderAlta, responderLista, type AccesosMapa, type PuertosInmuebles } from './inmuebles-api.ts'

const MIO = '11111111-1111-1111-1111-111111111111'
const GESTION = '22222222-2222-2222-2222-222222222222'
const AJENO = '33333333-3333-3333-3333-333333333333'

const cuerpo = (titular: unknown) => ({
  titular, alias: 'Socorro 2B', uso: 'vivienda', cp: '41003', provincia: 'Sevilla', municipio: 'Sevilla',
  direccion: 'CL SOCORRO 24', viaOficial: { tipo: 'CL', nombre: 'SOCORRO' }, enComunidad: null,
})

function puertos(accesos: AccesosMapa) {
  const llamadas = { listar: [] as string[][], crear: [] as string[] }
  const p: PuertosInmuebles = {
    accesos: async () => accesos,
    listar: async (ids) => {
      llamadas.listar.push([...ids])
      return []
    },
    crear: async ({ clienteId }) => {
      llamadas.crear.push(clienteId)
      return { ok: true, id: 'nuevo' }
    },
  }
  return { p, llamadas }
}
const mapa = (e: [string, NivelPatrimonio][]) => new Map(e)

test('identidad SIN acceso: lista vacía y alta = 404 (nunca 403), sin tocar la BD', async () => {
  const { p, llamadas } = puertos(mapa([]))
  assert.deepEqual((await responderLista(p)).body, { titulares: [] })
  assert.deepEqual(llamadas.listar, [])
  const r = await responderAlta(p, cuerpo(AJENO))
  assert.equal(r.status, 404)
  assert.deepEqual(llamadas.crear, [])
})

test('otra identidad: ni ve ni crea en un titular AJENO (404 idéntica a «no existe»)', async () => {
  const { p, llamadas } = puertos(mapa([[MIO, 'total']]))
  const ajeno = await responderAlta(p, cuerpo(AJENO))
  const inexistente = await responderAlta(p, cuerpo('no-existe'))
  assert.equal(ajeno.status, 404)
  assert.deepEqual(ajeno, inexistente)
  assert.deepEqual(llamadas.crear, [])
  await responderLista(p)
  assert.deepEqual(llamadas.listar, [[MIO]])
})

test('nivel Gestión no da de alta: 404 (puede ver, no crear)', async () => {
  const { p, llamadas } = puertos(mapa([[GESTION, 'gestion']]))
  assert.equal((await responderAlta(p, cuerpo(GESTION))).status, 404)
  assert.deepEqual(llamadas.crear, [])
})

test('nivel Total crea en SU titular y el servidor decide a quién (titularId/correduriaId del cuerpo no cuentan)', async () => {
  const { p, llamadas } = puertos(mapa([[MIO, 'total']]))
  const r = await responderAlta(p, { ...cuerpo(MIO), titularId: AJENO, correduriaId: AJENO, clienteId: AJENO })
  assert.equal(r.status, 201)
  assert.deepEqual(llamadas.crear, [MIO])
})

test('cuerpo sin titular o no-objeto: 404, no 400', async () => {
  const { p } = puertos(mapa([[MIO, 'total']]))
  assert.equal((await responderAlta(p, null)).status, 404)
  assert.equal((await responderAlta(p, { alias: 'x' })).status, 404)
})

test('autorizado con datos malos: 400 y CP primero', async () => {
  const { p } = puertos(mapa([[MIO, 'total']]))
  const r = await responderAlta(p, { ...cuerpo(MIO), cp: '' })
  assert.equal(r.status, 400)
  assert.equal(r.body.campo, 'cp')
})

test('duplicado: 409', async () => {
  const { p } = puertos(mapa([[MIO, 'total']]))
  p.crear = async () => ({ ok: false, motivo: 'duplicado' })
  assert.equal((await responderAlta(p, cuerpo(MIO))).status, 409)
})

test('edificio con unidades: el alta pasa las unidades al puerto (una transacción) y lo dice en la respuesta', async () => {
  const { p } = puertos(mapa([[MIO, 'total']]))
  let recibidas: string[] = []
  p.crear = async ({ datos }) => {
    recibidas = datos.unidades
    return { ok: true, id: 'ed' }
  }
  const r = await responderAlta(p, { ...cuerpo(MIO), uso: 'edificio', unidades: ['Piso 1', 'Piso 2'] })
  assert.equal(r.status, 201)
  assert.equal(r.body.unidades, 2)
  assert.deepEqual(recibidas, ['Piso 1', 'Piso 2'])
})
