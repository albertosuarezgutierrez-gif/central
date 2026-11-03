import { test } from 'node:test'
import assert from 'node:assert/strict'

import { DIAS_VALIDEZ_RECOMENDACION, MAX_RECOMENDACIONES_DIA } from '@central/module-patrimonio'

import {
  responderAnularRecomendacion,
  responderCrearRecomendacion,
  responderListarRecomendaciones,
  type FilaRecomendacionPropia,
  type PuertosRecomendacion,
} from './recomendacion-api.ts'

// `ahora` inyectado; las fechas de las filas son relativas a él (nunca fecha fija contra el reloj real).
const AHORA = new Date()
const dias = (n: number) => new Date(AHORA.getTime() + n * 24 * 60 * 60 * 1000)
const ID = '11111111-1111-4111-8111-111111111111'

function puertos(o: Partial<PuertosRecomendacion> & { filas?: FilaRecomendacionPropia[]; conAcceso?: boolean; creadas?: number; escritas?: unknown[] } = {}): PuertosRecomendacion {
  return {
    accesos: async () => new Map(o.conAcceso === false ? [] : [['cliente-1', 'total' as const]]),
    ahora: () => AHORA,
    hashCorreo: (c) => `hash:${c}`,
    esMiCorreo: async () => false,
    creadasDesde: async () => o.creadas ?? 0,
    crear: async (x) => {
      o.escritas?.push(x)
      return { id: ID, repetida: false }
    },
    listar: async () => o.filas ?? [],
    anular: async () => true,
    canjes: async () => [],
    ...o,
  } as PuertosRecomendacion
}

test('crear: normaliza el correo, guarda SOLO el hash y caduca a los 30 días; no envía nada', async () => {
  const escritas: unknown[] = []
  const r = await responderCrearRecomendacion(puertos({ escritas }), { correo: '  Ana@Correo.ES ' })
  assert.equal(r.status, 201)
  assert.deepEqual(escritas, [{ correoHash: 'hash:ana@correo.es', caducaEn: dias(DIAS_VALIDEZ_RECOMENDACION) }])
  assert.doesNotMatch(JSON.stringify(r.body), /ana@correo/i, 'la respuesta no repite el correo')
})

test('🚨 sin acceso a patrimonio: 404 en todo (nunca 403) y no se escribe nada', async () => {
  const escritas: unknown[] = []
  const p = puertos({ conAcceso: false, escritas })
  assert.equal((await responderCrearRecomendacion(p, { correo: 'ana@correo.es' })).status, 404)
  assert.equal((await responderListarRecomendaciones(p)).status, 404)
  assert.equal((await responderAnularRecomendacion(p, ID)).status, 404)
  assert.deepEqual(escritas, [])
})

test('crear: correo inválido 400, a sí mismo 400, tope diario 429; ninguno escribe', async () => {
  const escritas: unknown[] = []
  assert.equal((await responderCrearRecomendacion(puertos({ escritas }), { correo: 'no-es-correo' })).status, 400)
  assert.equal((await responderCrearRecomendacion(puertos({ escritas }), null)).status, 400)
  const yo = await responderCrearRecomendacion(puertos({ escritas, esMiCorreo: async () => true }), { correo: 'yo@correo.es' })
  assert.deepEqual([yo.status, yo.body.error], [400, 'a_si_mismo'])
  const tope = await responderCrearRecomendacion(puertos({ escritas, creadas: MAX_RECOMENDACIONES_DIA }), { correo: 'ana@correo.es' })
  assert.deepEqual([tope.status, tope.body.error], [429, 'limite_diario'])
  assert.deepEqual(escritas, [])
})

test('🚨 la lista no dice a quién se invitó ni quién canjeó: solo id, estado y fechas', async () => {
  const filas: FilaRecomendacionPropia[] = [
    { id: ID, creadaEn: dias(-1), caducaEn: dias(29), anuladaEn: null, canjeadaEn: null },
    { id: 'b', creadaEn: dias(-100), caducaEn: dias(-70), anuladaEn: null, canjeadaEn: null },
    { id: 'c', creadaEn: dias(-20), caducaEn: dias(10), anuladaEn: null, canjeadaEn: dias(-5) },
  ]
  const r = await responderListarRecomendaciones(puertos({ filas, canjes: async () => [dias(-5)] }))
  const lista = r.body.recomendaciones as Array<Record<string, unknown>>
  assert.deepEqual(lista.map((x) => x.estado), ['pendiente', 'caducada', 'conseguida'])
  for (const x of lista) assert.deepEqual(Object.keys(x).sort(), ['caducaEn', 'creadaEn', 'estado', 'id'])
  assert.doesNotMatch(JSON.stringify(r.body), /hash|correo|identidad/i)
  // La recompensa dura 90 días desde el canje (5 días atrás → quedan 85).
  assert.equal(new Date(r.body.recompensaHasta as string).getTime(), dias(85).getTime())
})

test('lista: sin canjes vivos, recompensaHasta es null (también con un canje de hace más de 90 días)', async () => {
  assert.equal((await responderListarRecomendaciones(puertos())).body.recompensaHasta, null)
  assert.equal((await responderListarRecomendaciones(puertos({ canjes: async () => [dias(-120), null] }))).body.recompensaHasta, null)
})

test('anular: id con forma de UUID y de esta persona; ajeno o desconocido = 404', async () => {
  assert.equal((await responderAnularRecomendacion(puertos(), 'no-uuid')).status, 404)
  assert.equal((await responderAnularRecomendacion(puertos(), 7)).status, 404)
  assert.equal((await responderAnularRecomendacion(puertos({ anular: async () => false }), ID)).status, 404)
  assert.equal((await responderAnularRecomendacion(puertos(), ID)).status, 200)
})
