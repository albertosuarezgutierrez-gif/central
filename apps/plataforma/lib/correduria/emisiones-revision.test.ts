// Cepos de la pantalla «Emisiones a revisar» (03/10/2026): motivo→texto, vacío ≠ error, contador y la
// idempotencia de «Marcar revisada» tal como la lee plataforma.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import {
  MOTIVOS_REVISION, colaDeProxy, contadorCola, interpretarCola, interpretarResolucion, pantallaCola,
  textoCoincidencias, textoMotivo,
} from './emisiones-revision.ts'

const ID = '123e4567-e89b-12d3-a456-426614174000'
const CLI = '223e4567-e89b-12d3-a456-426614174000'
const fila = (extra: Record<string, unknown> = {}) => ({
  id: ID, projectId: '4021', motivo: 'sin_cliente', coincidencias: 0, ramoVendor: 'Car', estadoEmision: 'aprobada',
  compania: 'Allianz', numeroPoliza: null, clienteId: null, detalle: null, veces: 2,
  primeraVezAt: '2026-10-03T08:00:00.000Z', ultimaVezAt: '2026-10-03T09:00:00.000Z', ...extra,
})
const ok = (filas: unknown[], total = filas.length) => ({ estado: 'ok', total, filas })

test('motivo→texto: los siete motivos de la tabla tienen texto propio y distinto', () => {
  const titulos = MOTIVOS_REVISION.map((m) => textoMotivo(m).titulo)
  assert.equal(new Set(titulos).size, MOTIVOS_REVISION.length)
  for (const m of MOTIVOS_REVISION) assert.ok(textoMotivo(m).que.length > 20, m)
})

test('un motivo desconocido se enseña tal cual, no se esconde bajo otro texto', () => {
  assert.match(textoMotivo('inventado').titulo, /inventado/)
})

test('coincidencias NULL = no se buscó: no se dice «0 fichas»', () => {
  assert.equal(textoCoincidencias('sin_cliente', null), null)
  assert.equal(textoCoincidencias('sin_cliente', 0), '0 fichas con ese documento')
  assert.equal(textoCoincidencias('varios_clientes', 3), '3 fichas con ese documento')
  assert.equal(textoCoincidencias('bloqueada', 2), null)
})

test('cola vacía (lectura buena con 0) es «vacia»; cargando, error y sin configurar NO lo son', () => {
  assert.equal(pantallaCola(null), 'cargando')
  assert.equal(pantallaCola(interpretarCola(200, ok([]))), 'vacia')
  assert.equal(pantallaCola(interpretarCola(200, ok([fila()]))), 'lista')
  for (const c of [interpretarCola(500, { estado: 'error' }), interpretarCola(401, null), interpretarCola(200, { estado: 'ok' }), interpretarCola(200, null)]) {
    assert.equal(pantallaCola(c), 'error')
  }
  assert.equal(pantallaCola(interpretarCola(200, { estado: 'sin_configurar' })), 'sin_configurar')
})

test('una respuesta a medias NO es «nada pendiente»: sin total, sin filas o con una fila rota es error', () => {
  assert.equal(interpretarCola(200, { estado: 'ok', filas: [] }).estado, 'error')
  assert.equal(interpretarCola(200, { estado: 'ok', total: 0 }).estado, 'error')
  assert.equal(interpretarCola(200, ok([fila({ id: 'no-uuid' })])).estado, 'error')
  assert.equal(interpretarCola(200, ok([fila({ motivo: null })])).estado, 'error')
})

test('el cliente solo se enlaza si es un uuid', () => {
  const a = interpretarCola(200, ok([fila({ clienteId: CLI })]))
  const b = interpretarCola(200, ok([fila({ clienteId: '../../x' })]))
  assert.equal(a.estado === 'ok' && a.filas[0].clienteId, CLI)
  assert.equal(b.estado === 'ok' && b.filas[0].clienteId, null)
})

test('hayMas sale de lo ya cargado frente al total', () => {
  const c = interpretarCola(200, ok([fila()], 120), 50)
  assert.equal(c.estado === 'ok' && c.hayMas, true)
  const d = interpretarCola(200, ok([fila()], 51), 50)
  assert.equal(d.estado === 'ok' && d.hayMas, false)
})

test('contador: undefined cargando, número si se leyó (0 incluido), null si no se pudo leer', () => {
  assert.equal(contadorCola(null), undefined)
  assert.equal(contadorCola(interpretarCola(200, ok([]))), 0)
  assert.equal(contadorCola(interpretarCola(200, ok([fila()], 7))), 7)
  assert.equal(contadorCola(interpretarCola(502, null)), null)
  assert.equal(contadorCola({ estado: 'sin_configurar' }), null)
})

test('lo que recibe el navegador: HTML/401/forma rara es error, nunca vacío', () => {
  assert.equal(colaDeProxy(502, null).estado, 'error')
  assert.deepEqual(colaDeProxy(401, null), { estado: 'error', motivo: 'sin_sesion' })
  assert.equal(colaDeProxy(200, { estado: 'ok', total: 0, filas: [] }).estado, 'error') // falta hayMas
  assert.equal(pantallaCola(colaDeProxy(200, { estado: 'ok', total: 0, filas: [], hayMas: false })), 'vacia')
  assert.equal(colaDeProxy(200, { estado: 'error', motivo: 'red' }).estado, 'error')
})

test('resolver es idempotente: resuelta y ya_resuelta son ok; 404, 5xx y respuesta rara no', () => {
  assert.deepEqual(interpretarResolucion(200, { estado: 'resuelta', id: ID }), { estado: 'ok', yaResuelta: false })
  assert.deepEqual(interpretarResolucion(200, { estado: 'ya_resuelta', id: ID }), { estado: 'ok', yaResuelta: true })
  assert.equal(interpretarResolucion(404, { estado: 'error', mensaje: 'esa revisión no existe' }).estado, 'error')
  assert.equal(interpretarResolucion(500, null).estado, 'error')
  assert.equal(interpretarResolucion(200, { estado: 'algo' }).estado, 'error')
  assert.equal(interpretarResolucion(401, null).estado, 'error')
})

test('la pantalla no inventa un enlace a Avant2 y el botón sigue ≥44px', () => {
  const src = readFileSync(new URL('../../app/(usuario)/correduria/EmisionesRevision.tsx', import.meta.url), 'utf8')
  assert.ok(!/https?:\/\/[^'"`\s]*avant2/i.test(src))
  assert.ok(src.includes('Marcar revisada'))
  assert.ok((src.match(/minHeight: 44/g) ?? []).length >= 3)
})
