// «Pedir precio» del patrimonio (24/10/2026, P14): aislamiento, nivel y estado, con puertos falsos.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import { responderPedirPrecio, type PuertosPedirPrecio } from './pedir-precio-api.ts'
import type { FilaEnlace, InmuebleDeSeguros, PolizaVisible } from './seguros-inmueble-api.ts'
import type { ResultadoPuentePedirPrecio } from './pedir-precio-puente.ts'

const INM = '11111111-1111-4111-8111-111111111111'
const AJENO = '22222222-2222-4222-8222-222222222222'
const P = '33333333-3333-4333-8333-333333333333'

const inmueble = (x: Partial<InmuebleDeSeguros> = {}): InmuebleDeSeguros => ({
  id: INM, alias: 'Piso', nivel: 'total', enComunidad: false, sinSeguroDeclaradoEn: new Date('2026-10-12T09:00:00Z'),
  referenciaCatastral: null, cp: null, via: null, numero: null, ...x,
})

function puertos(o: { inm?: InmuebleDeSeguros; filas?: FilaEnlace[]; cartera?: PolizaVisible[]; puente?: ResultadoPuentePedirPrecio } = {}) {
  const llamadas: unknown[] = []
  const p: PuertosPedirPrecio = {
    inmueble: async (id) => (id === INM ? (o.inm ?? inmueble()) : null),
    enlaces: async () => o.filas ?? [],
    visibles: async () => ({ cartera: o.cartera ?? [], declaradas: [] }),
    crearEnlace: async () => 'ok',
    archivarEnlace: async () => true,
    declararSinSeguro: async () => {},
    declararPresidenteComunidad: async () => {},
    pedirPorPuente: async (x) => {
      llamadas.push(x)
      return o.puente ?? { estado: 'ok', pedidoEl: '2026-10-24', yaExistia: false }
    },
  }
  return { p, llamadas }
}

test('🚨 inmueble ajeno, id raro o nivel que no es Total → la MISMA 404 y no se llama al puente', async () => {
  const { p, llamadas } = puertos()
  for (const id of [AJENO, 'no-uuid', undefined]) assert.deepEqual(await responderPedirPrecio(p, id), { status: 404, body: { error: 'no_encontrado' } })
  const g = puertos({ inm: inmueble({ nivel: 'gestion' }) })
  assert.deepEqual(await responderPedirPrecio(g.p, INM), { status: 404, body: { error: 'no_encontrado' } })
  assert.equal(llamadas.length + g.llamadas.length, 0)
})

test('sin seguro (declarado) → puente con tipo inmueble_sin_seguro y SIN clienteId; 201 la primera vez, 200 si ya existía', async () => {
  const a = puertos()
  const r = await responderPedirPrecio(a.p, INM)
  assert.equal(r.status, 201)
  assert.deepEqual(a.llamadas, [{ inmuebleId: INM, tipo: 'inmueble_sin_seguro' }])
  const b = puertos({ puente: { estado: 'ok', pedidoEl: '2026-10-20', yaExistia: true } })
  assert.deepEqual(await responderPedirPrecio(b.p, INM), { status: 200, body: { ok: true, yaExistia: true, pedidoEl: '2026-10-20' } })
})

test('seguro caducado → tipo seguro_no_vigente', async () => {
  const hogar: PolizaVisible = { tipo: 'cartera', id: P, compania: 'Mapfre', ramo: 'hogar', ubicacion: null, referenciaCatastral: null, vence: '2026-01-01', vigente: false }
  const { p, llamadas } = puertos({
    inm: inmueble({ sinSeguroDeclaradoEn: null }),
    filas: [{ id: 'e', polizaId: P, polizaDeclaradaId: null, estado: 'confirmado', origen: 'manual' }],
    cartera: [hogar],
  })
  assert.equal((await responderPedirPrecio(p, INM)).status, 201)
  assert.deepEqual(llamadas, [{ inmuebleId: INM, tipo: 'seguro_no_vigente' }])
})

test('🚨 inmueble sin mirar o asegurado: 409 no_aplica y NO se llama al puente', async () => {
  const sinMirar = puertos({ inm: inmueble({ sinSeguroDeclaradoEn: null }) })
  assert.deepEqual(await responderPedirPrecio(sinMirar.p, INM), { status: 409, body: { error: 'no_aplica' } })
  const vigente: PolizaVisible = { tipo: 'cartera', id: P, compania: 'Mapfre', ramo: 'hogar', ubicacion: null, referenciaCatastral: null, vence: '2027-01-01', vigente: true }
  const asegurado = puertos({ filas: [{ id: 'e', polizaId: P, polizaDeclaradaId: null, estado: 'confirmado', origen: 'manual' }], cartera: [vigente] })
  assert.equal((await responderPedirPrecio(asegurado.p, INM)).status, 409)
  assert.equal(sinMirar.llamadas.length + asegurado.llamadas.length, 0)
})

test('los fallos del puente no se muestran como «pedido»: sin puente 503, caída 502, no_aplica de asegura 409, ajeno 404', async () => {
  assert.deepEqual((await responderPedirPrecio(puertos({ puente: { estado: 'sin_puente' } }).p, INM)).status, 503)
  assert.deepEqual((await responderPedirPrecio(puertos({ puente: { estado: 'error', causa: 'red' } }).p, INM)).status, 502)
  assert.deepEqual((await responderPedirPrecio(puertos({ puente: { estado: 'no_aplica' } }).p, INM)).status, 409)
  assert.deepEqual((await responderPedirPrecio(puertos({ puente: { estado: 'no_encontrado' } }).p, INM)).status, 404)
})

test('🚨 cableado: el cliente del puente no manda clienteId, no usa lead-declarada y la ruta no toca prisma', () => {
  const quita = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
  const puente = quita(readFileSync(new URL('./pedir-precio-puente.ts', import.meta.url), 'utf8'))
  assert.match(puente, /JSON\.stringify\(\{ identidadId: x\.identidadId, tipo: x\.tipo, inmuebleId: x\.inmuebleId, contratoId: x\.contratoId, polizaDeclaradaId: x\.polizaDeclaradaId \}\)/)
  assert.doesNotMatch(puente, /clienteId|lead-declarada|prisma/)
  assert.match(puente, /\/api\/portal\/patrimonio\/pedir-precio/)
  assert.match(puente, /ASEGURA_PORTAL_PUENTE_SECRET/)
  const ruta = quita(readFileSync(new URL('../../app/api/patrimonio/inmuebles/[id]/pedir-precio/route.ts', import.meta.url), 'utf8'))
  assert.doesNotMatch(ruta, /prisma|lead-declarada|clienteId/)
  assert.match(ruta, /requireIdentidad\(\)/)
})

// ─── Seguro de la comunidad (25/10/2026) ────────────────────────────────────
const comunidadOk = (x: Partial<InmuebleDeSeguros> = {}) =>
  inmueble({ enComunidad: true, presidenteComunidad: true, sinSeguroDeclaradoEn: null, ...x })
const dComunidad: PolizaVisible = { tipo: 'cartera', id: P, compania: 'Mapfre', ramo: 'comunidades', ubicacion: null, referenciaCatastral: null, vence: '2027-01-01', vigente: true }

test('comunidad: piso + presidente marcado + sin póliza de comunidad → puente con tipo comunidad (aunque el piso tenga su hogar)', async () => {
  const a = puertos({ inm: comunidadOk() })
  assert.equal((await responderPedirPrecio(a.p, INM, { tipo: 'comunidad' })).status, 201)
  assert.deepEqual(a.llamadas, [{ inmuebleId: INM, tipo: 'comunidad' }])
  const hogarVigente: PolizaVisible = { ...dComunidad, ramo: 'hogar' }
  const b = puertos({ inm: comunidadOk(), filas: [{ id: 'e', polizaId: P, polizaDeclaradaId: null, estado: 'confirmado', origen: 'manual' }], cartera: [hogarVigente] })
  assert.equal((await responderPedirPrecio(b.p, INM, { tipo: 'comunidad' })).status, 201)
})

test('🚨 comunidad: sin presidente, sin piso, con póliza de comunidad en vigor o nivel que no es Total → no llega al puente', async () => {
  const casos = [
    puertos({ inm: comunidadOk({ presidenteComunidad: null }) }),
    puertos({ inm: comunidadOk({ presidenteComunidad: false }) }),
    puertos({ inm: comunidadOk({ enComunidad: false, tipoCatastro: 'unifamiliar' }) }),
    puertos({ inm: comunidadOk({ enComunidad: null, tipoCatastro: null }) }),
    puertos({ inm: comunidadOk(), filas: [{ id: 'e', polizaId: P, polizaDeclaradaId: null, estado: 'confirmado', origen: 'manual' }], cartera: [dComunidad] }),
  ]
  for (const c of casos) assert.deepEqual(await responderPedirPrecio(c.p, INM, { tipo: 'comunidad' }), { status: 409, body: { error: 'no_aplica' } })
  const g = puertos({ inm: comunidadOk({ nivel: 'gestion' }) })
  assert.deepEqual(await responderPedirPrecio(g.p, INM, { tipo: 'comunidad' }), { status: 404, body: { error: 'no_encontrado' } })
  assert.equal([...casos, g].reduce((n, c) => n + c.llamadas.length, 0), 0)
})

test('comunidad: el Catastro dice piso aunque la persona no marcara comunidad; sin saber si la póliza sigue en vigor, no se ofrece', async () => {
  const catastro = puertos({ inm: comunidadOk({ enComunidad: null, tipoCatastro: 'piso' }) })
  assert.equal((await responderPedirPrecio(catastro.p, INM, { tipo: 'comunidad' })).status, 201)
  const dudosa = puertos({ inm: comunidadOk(), filas: [{ id: 'e', polizaId: P, polizaDeclaradaId: null, estado: 'confirmado', origen: 'manual' }], cartera: [{ ...dComunidad, vigente: null }] })
  assert.equal((await responderPedirPrecio(dudosa.p, INM, { tipo: 'comunidad' })).status, 409)
})

test('el cuerpo no manda: otro tipo o basura se ignora y decide el servidor (sin seguro → inmueble_sin_seguro)', async () => {
  const a = puertos()
  await responderPedirPrecio(a.p, INM, { tipo: 'seguro_no_vigente', clienteId: 'x' })
  assert.deepEqual(a.llamadas, [{ inmuebleId: INM, tipo: 'inmueble_sin_seguro' }])
})
