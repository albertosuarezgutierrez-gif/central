// Edificio sin división horizontal (27/10/2026): unidad suelta y reparto, con el aislamiento entre titulares.
import { test } from 'node:test'
import assert from 'node:assert/strict'

import type { NivelPatrimonio } from '@central/module-patrimonio'

import { responderNuevaUnidad, responderReparto, type AccesosMapa, type EdificioAutorizado, type PuertosEdificio } from './edificio-api.ts'

const MIO = '11111111-1111-1111-1111-111111111111'
const AJENO = '33333333-3333-3333-3333-333333333333'
const ED = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'
const ED_AJENO = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'

const edificio = (p: Partial<EdificioAutorizado> = {}): EdificioAutorizado => ({
  id: ED, clienteId: MIO, titularId: 'tit-mio', uso: 'edificio', inmueblePadreId: null, archivado: false,
  unidades: [
    { id: 'u1', alias: 'Piso 1', superficieM2: 60, repartoPorcentaje: null },
    { id: 'u2', alias: 'Piso 2', superficieM2: null, repartoPorcentaje: null },
  ],
  ...p,
})

function puertos(accesos: [string, NivelPatrimonio][], filas: EdificioAutorizado[] = [edificio(), edificio({ id: ED_AJENO, clienteId: AJENO, titularId: 'tit-ajeno' })]) {
  const llamadas = { crear: [] as { titularId: string; padre: string; alias: string }[], reparto: [] as unknown[] }
  const mapa: AccesosMapa = new Map(accesos)
  const p: PuertosEdificio = {
    accesos: async () => mapa,
    // Como la BD real: SOLO devuelve el inmueble si su titular está en los accesos.
    edificio: async (id, acc) => filas.find((f) => f.id === id && acc.has(f.clienteId)) ?? null,
    crearUnidad: async ({ edificio: e, alias }) => {
      llamadas.crear.push({ titularId: e.titularId, padre: e.id, alias })
      return { id: 'nueva' }
    },
    guardarReparto: async (x) => {
      llamadas.reparto.push(x)
    },
  }
  return { p, llamadas }
}

test('🚨 unidad en el edificio de OTRO titular: 404 idéntica a «no existe», sin escribir nada', async () => {
  const { p, llamadas } = puertos([[MIO, 'total']])
  const ajeno = await responderNuevaUnidad(p, ED_AJENO, { alias: 'Piso 3' })
  const inexistente = await responderNuevaUnidad(p, 'ffffffff-ffff-4fff-8fff-ffffffffffff', { alias: 'Piso 3' })
  assert.equal(ajeno.status, 404)
  assert.deepEqual(ajeno, inexistente)
  assert.equal((await responderNuevaUnidad(p, 'no-es-uuid', { alias: 'x' })).status, 404)
  assert.deepEqual(llamadas.crear, [])
})

test('unidad: nace en el TITULAR del edificio (nunca el del cuerpo) y solo con nivel Total', async () => {
  const { p, llamadas } = puertos([[MIO, 'total']])
  const r = await responderNuevaUnidad(p, ED, { alias: ' Piso 3 ', titular: AJENO, titularId: 'tit-ajeno', superficieM2: '55,5' })
  assert.equal(r.status, 201)
  assert.deepEqual(llamadas.crear, [{ titularId: 'tit-mio', padre: ED, alias: 'Piso 3' }])
  const gestion = puertos([[MIO, 'gestion']])
  assert.equal((await responderNuevaUnidad(gestion.p, ED, { alias: 'Piso 4' })).status, 404)
  assert.deepEqual(gestion.llamadas.crear, [])
})

test('unidad: solo bajo un EDIFICIO de primer nivel y vivo; ni edificio dentro de edificio ni nombre repetido', async () => {
  const filas = [
    edificio({ id: ED, uso: 'vivienda' }),
    edificio({ id: ED_AJENO, inmueblePadreId: ED }),
  ]
  const { p, llamadas } = puertos([[MIO, 'total']], filas)
  assert.equal((await responderNuevaUnidad(p, ED, { alias: 'X' })).status, 404)
  assert.equal((await responderNuevaUnidad(p, ED_AJENO, { alias: 'X' })).status, 404)
  const archivado = puertos([[MIO, 'total']], [edificio({ archivado: true })])
  assert.equal((await responderNuevaUnidad(archivado.p, ED, { alias: 'X' })).status, 404)
  const bien = puertos([[MIO, 'total']])
  assert.equal((await responderNuevaUnidad(bien.p, ED, { alias: 'Sub', uso: 'edificio' })).status, 400)
  assert.equal((await responderNuevaUnidad(bien.p, ED, { alias: 'piso 1' })).status, 409)
  assert.equal((await responderNuevaUnidad(bien.p, ED, { alias: 'P', superficieM2: -3 })).status, 400)
  assert.deepEqual([...llamadas.crear, ...archivado.llamadas.crear, ...bien.llamadas.crear], [])
})

test('🚨 reparto: una unidad que no es de ESTE edificio = 404 y no se escribe nada', async () => {
  const { p, llamadas } = puertos([[MIO, 'total'], [AJENO, 'total']])
  const r = await responderReparto(p, ED, { criterio: 'm2', unidades: [{ id: 'u1', superficieM2: 60 }, { id: 'unidad-del-ajeno', superficieM2: 10 }] })
  assert.equal(r.status, 404)
  assert.deepEqual(llamadas.reparto, [])
  assert.equal((await responderReparto(puertos([[MIO, 'total']]).p, ED_AJENO, { criterio: 'm2' })).status, 404)
})

test('reparto: se guarda aunque esté incompleto y la respuesta dice qué falta (nunca «a partes iguales»)', async () => {
  const { p, llamadas } = puertos([[MIO, 'total']])
  const r = await responderReparto(p, ED, { criterio: 'm2', unidades: [{ id: 'u1', superficieM2: 60 }] })
  assert.equal(r.status, 200)
  assert.deepEqual(r.body, { reparte: false, motivo: 'falta_superficie', unidades: ['u2'] })
  assert.equal(llamadas.reparto.length, 1)
  const ok = await responderReparto(p, ED, { criterio: 'porcentaje', unidades: [{ id: 'u1', porcentaje: 40 }, { id: 'u2', porcentaje: '60' }] })
  assert.deepEqual(ok.body, { reparte: true, criterio: 'porcentaje' })
  assert.equal((await responderReparto(p, ED, { criterio: 'iguales' })).status, 400)
  assert.equal((await responderReparto(p, ED, { criterio: 'porcentaje', unidades: [{ id: 'u1', porcentaje: 140 }] })).status, 400)
  const gestion = puertos([[MIO, 'gestion']])
  assert.equal((await responderReparto(gestion.p, ED, { criterio: 'm2' })).status, 404)
})
