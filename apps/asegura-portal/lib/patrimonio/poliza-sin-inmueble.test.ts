// Aviso «póliza sin inmueble» (25/10/2026): saneado de la URL, puente de lectura y cableado. Las reglas puras están en
// `packages/module-patrimonio/src/poliza-sin-inmueble.test.ts`.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import { interpretarPeticionesAbiertas } from './pedir-precio-puente.ts'
import { precargaDeParametros } from './precarga-alta.ts'

const U = '11111111-1111-4111-8111-111111111111'

test('sin alta=1 no hay precarga', () => {
  assert.equal(precargaDeParametros({}), null)
  assert.equal(precargaDeParametros({ alta: '0', cp: '41003' }), null)
})

test('la URL es una petición: cada campo malformado queda vacío', () => {
  const r = precargaDeParametros({ alta: '1', cp: '4100', dir: 'x'.repeat(201), rc: 'corta', titular: 'no', poliza: 'auto:' + U })
  assert.deepEqual(r, { cp: '', direccion: '', referenciaCatastral: '', titular: '', poliza: null })
})

test('precarga válida', () => {
  const r = precargaDeParametros({ alta: '1', cp: '41003', dir: 'CALLE  SOCORRO 24', rc: '1234567vk1234s0001ab', titular: U, poliza: `declarada:${U}` })
  assert.deepEqual(r, { cp: '41003', direccion: 'CALLE SOCORRO 24', referenciaCatastral: '1234567VK1234S0001AB', titular: U, poliza: { tipo: 'declarada', id: U } })
})

test('puente de lectura: solo un 200 ok bien formado vale; todo lo demás es «sin comprobar» (null), jamás lista vacía', () => {
  assert.deepEqual(interpretarPeticionesAbiertas(200, { estado: 'ok', peticiones: [] }), [])
  assert.deepEqual(interpretarPeticionesAbiertas(200, { estado: 'ok', peticiones: [{ inmuebleId: U, pedidoEl: '2026-10-20' }] }), [{ inmuebleId: U, pedidoEl: '2026-10-20' }])
  assert.equal(interpretarPeticionesAbiertas(503, { estado: 'error' }), null)
  assert.equal(interpretarPeticionesAbiertas(401, { error: 'No autorizado' }), null)
  assert.equal(interpretarPeticionesAbiertas(200, { estado: 'ok' }), null)
  assert.equal(interpretarPeticionesAbiertas(200, { estado: 'ok', peticiones: [{ inmuebleId: 'x', pedidoEl: '2026-10-20' }] }), null)
  assert.equal(interpretarPeticionesAbiertas(200, null), null)
})

const sinComentarios = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

test('🚨 el adaptador parte de accesosPatrimonio, no ofrece sin patrimonio y lee las peticiones por el puente', () => {
  const src = sinComentarios(readFileSync(new URL('./poliza-sin-inmueble-bd.ts', import.meta.url), 'utf8'))
  assert.match(src, /accesosPatrimonio\(identidadId\)/)
  assert.match(src, /acc\.size === 0\) return \[\]/)
  assert.match(src, /peticionesPedirPrecioPorPuente\(identidadId\)/)
  assert.match(src, /peticionesPrecio\(identidadId\)/)
  assert.doesNotMatch(src, /prisma\.oportunidad|oportunidades/)
  // Ofrecer exige nivel: alta para «añadir», enlazar_seguro para «enlazar».
  assert.match(src, /puede\(nivel, 'alta_baja'\)/)
  assert.match(src, /puede\(acc\.get\(i\.titular\.clienteId\), 'enlazar_seguro'\)/)
})

test('🚨 la ficha de la bóveda, Inicio y Patrimonio usan el aviso (y el alta desde póliza enlaza tras crear)', () => {
  const nuevo = sinComentarios(readFileSync(new URL('../../app/(portal)/patrimonio/NuevoInmueble.tsx', import.meta.url), 'utf8'))
  assert.match(nuevo, /accion: 'enlazar'/)
  const inicio = readFileSync(new URL('../inicio.ts', import.meta.url), 'utf8')
  assert.match(inicio, /avisosPolizasSinInmueble/)
})
