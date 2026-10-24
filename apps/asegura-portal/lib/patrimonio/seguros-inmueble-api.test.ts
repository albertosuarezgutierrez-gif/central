// Aislamiento y tres estados de los SEGUROS del inmueble (24/10/2026, P11), con puertos falsos.
import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  estadosDeInmuebles,
  responderSegurosInmueble,
  segurosDeInmueble,
  type FilaEnlace,
  type InmuebleDeSeguros,
  type PolizaVisible,
  type PuertosSegurosInmueble,
} from './seguros-inmueble-api.ts'

const INM = '11111111-1111-4111-8111-111111111111'
const AJENO = '22222222-2222-4222-8222-222222222222'
const P_MIA = '33333333-3333-4333-8333-333333333333'
const P_AJENA = '44444444-4444-4444-8444-444444444444'
const P_AUTO = '55555555-5555-4555-8555-555555555555'
const D_MIA = '66666666-6666-4666-8666-666666666666'
const ENL = '77777777-7777-4777-8777-777777777777'

const inmueble = (x: Partial<InmuebleDeSeguros> = {}): InmuebleDeSeguros => ({
  id: INM, alias: 'Piso Socorro', nivel: 'gestion', enComunidad: true, sinSeguroDeclaradoEn: null,
  referenciaCatastral: '9872023VH5797S0001WX', cp: '41003', via: 'Calle Socorro', numero: '24', ...x,
})

const hogar: PolizaVisible = {
  tipo: 'cartera', id: P_MIA, compania: 'Mapfre', ramo: 'hogar', ubicacion: 'Calle Socorro 24, 41003 Sevilla',
  referenciaCatastral: null, vence: '2027-03-01', vigente: true,
}
const auto: PolizaVisible = { ...hogar, id: P_AUTO, ramo: 'auto', ubicacion: null }

function puertos(o: {
  inm?: InmuebleDeSeguros | null
  filas?: FilaEnlace[]
  cartera?: PolizaVisible[] | null
  declaradas?: PolizaVisible[] | null
} = {}) {
  const escritos: unknown[] = []
  const p: PuertosSegurosInmueble = {
    inmueble: async (id) => (id === INM ? (o.inm === undefined ? inmueble() : o.inm) : null),
    enlaces: async () => o.filas ?? [],
    visibles: async () => ({ cartera: o.cartera === undefined ? [hogar, auto] : o.cartera, declaradas: o.declaradas === undefined ? [] : o.declaradas }),
    crearEnlace: async (x) => { escritos.push(['crear', x]); return 'ok' },
    archivarEnlace: async (i, e) => { escritos.push(['archivar', i, e]); return e === ENL },
    declararSinSeguro: async (i, v) => { escritos.push(['sin_seguro', i, v]) },
  }
  return { p, escritos }
}

test('🚨 inmueble ajeno o id raro → 404 en lectura y escritura, sin escribir nada', async () => {
  const { p, escritos } = puertos()
  assert.equal(await segurosDeInmueble(p, AJENO), null)
  assert.equal(await segurosDeInmueble(p, 'no-uuid'), null)
  for (const cuerpo of [{ accion: 'sin_seguro', valor: true }, { accion: 'enlazar', tipo: 'cartera', polizaId: P_MIA, estado: 'confirmado' }]) {
    const r = await responderSegurosInmueble(p, AJENO, cuerpo)
    assert.equal(r.status, 404)
    assert.deepEqual(r.body, { error: 'no_encontrado' })
  }
  assert.deepEqual(escritos, [])
})

test('🚨 póliza que esta identidad NO ve → 404 (no confirma que exista), y nada se escribe', async () => {
  const { p, escritos } = puertos()
  const r = await responderSegurosInmueble(p, INM, { accion: 'enlazar', tipo: 'cartera', polizaId: P_AJENA, estado: 'confirmado' })
  assert.equal(r.status, 404)
  // Una declarada con el id de una póliza de cartera tampoco cuela (se busca en SU lista).
  const r2 = await responderSegurosInmueble(p, INM, { accion: 'enlazar', tipo: 'declarada', polizaId: P_MIA, estado: 'confirmado' })
  assert.equal(r2.status, 404)
  // Ni un ramo que no es de inmueble (el coche no asegura el piso).
  const r3 = await responderSegurosInmueble(p, INM, { accion: 'enlazar', tipo: 'cartera', polizaId: P_AUTO, estado: 'confirmado' })
  assert.equal(r3.status, 404)
  assert.deepEqual(escritos, [])
})

test('🚨 nivel que no permite enlazar (o desconocido) → la MISMA 404, sin escribir; la ficha no ofrece enlazar', async () => {
  const { p, escritos } = puertos({ inm: inmueble({ nivel: 'consulta' as never }) })
  const r = await responderSegurosInmueble(p, INM, { accion: 'sin_seguro', valor: true })
  assert.equal(r.status, 404)
  assert.deepEqual(escritos, [])
  assert.equal((await segurosDeInmueble(p, INM))!.puedeEnlazar, false)
})

test('cartera ilegible → 503 sin_comprobar, no se escribe a ciegas', async () => {
  const { p, escritos } = puertos({ cartera: null })
  const r = await responderSegurosInmueble(p, INM, { accion: 'enlazar', tipo: 'cartera', polizaId: P_MIA, estado: 'confirmado' })
  assert.equal(r.status, 503)
  assert.deepEqual(escritos, [])
})

test('enlazar una propuesta: el origen lo decide el servidor (lo que dice el navegador no basta)', async () => {
  const { p, escritos } = puertos()
  const r = await responderSegurosInmueble(p, INM, { accion: 'enlazar', tipo: 'cartera', polizaId: P_MIA, estado: 'confirmado', origen: 'propuesta_direccion' })
  assert.equal(r.status, 201)
  assert.deepEqual(escritos, [['crear', { inmuebleId: INM, tipo: 'cartera', polizaId: P_MIA, estado: 'confirmado', origen: 'propuesta_direccion' }]])
  const { p: p2, escritos: e2 } = puertos()
  await responderSegurosInmueble(p2, INM, { accion: 'enlazar', tipo: 'cartera', polizaId: P_MIA, estado: 'confirmado', origen: 'propuesta_refcat' })
  assert.equal((e2[0] as [string, { origen: string }])[1].origen, 'manual', 'la cartera no trae ref. catastral: no puede venir de ahí')
})

test('datos inválidos → 400; acción desconocida → 400', async () => {
  const { p } = puertos()
  assert.equal((await responderSegurosInmueble(p, INM, null)).status, 400)
  assert.equal((await responderSegurosInmueble(p, INM, { accion: 'enlazar', tipo: 'cartera', polizaId: P_MIA, estado: 'quizas' })).status, 400)
  assert.equal((await responderSegurosInmueble(p, INM, { accion: 'sin_seguro', valor: 'si' })).status, 400)
  assert.equal((await responderSegurosInmueble(p, INM, { accion: 'borrar' })).status, 400)
})

test('quitar un enlace que no es de ESE inmueble → 404', async () => {
  const { p } = puertos()
  assert.equal((await responderSegurosInmueble(p, INM, { accion: 'quitar', enlaceId: ENL })).status, 200)
  assert.equal((await responderSegurosInmueble(p, INM, { accion: 'quitar', enlaceId: P_MIA })).status, 404)
})

test('estado: sin filas ni declaración es «sin mirar» y hay propuesta por dirección', async () => {
  const { p } = puertos()
  const s = (await segurosDeInmueble(p, INM))!
  assert.equal(s.estado, 'sin_mirar')
  assert.deepEqual(s.propuestas.map((x) => [x.id, x.origen]), [[P_MIA, 'propuesta_direccion']])
  assert.equal(s.puedeEnlazar, true)
  assert.ok(!s.enlazables.some((x) => x.id === P_AUTO), 'el coche no se ofrece para el piso')
  assert.ok(!s.propuestas.some((x) => 'referenciaCatastral' in x), 'lo que se pinta no lleva la ref. catastral')
})

test('🚨 enlace a una póliza que quien mira NO ve: cuenta para el estado como «sin comprobar» y sin detalle', async () => {
  const { p } = puertos({ filas: [{ id: ENL, polizaId: P_AJENA, polizaDeclaradaId: null, estado: 'confirmado', origen: 'manual' }] })
  const s = (await segurosDeInmueble(p, INM))!
  assert.equal(s.estado, 'enlazado_sin_comprobar')
  assert.deepEqual(s.enlaces, [{ id: ENL, poliza: null }])
})

test('enlace visible y vigente → con seguro, con detalle; rechazado no reaparece como propuesta', async () => {
  const { p } = puertos({ filas: [{ id: ENL, polizaId: P_MIA, polizaDeclaradaId: null, estado: 'confirmado', origen: 'manual' }] })
  const s = (await segurosDeInmueble(p, INM))!
  assert.equal(s.estado, 'con_seguro')
  assert.equal(s.enlaces[0].poliza?.compania, 'Mapfre')
  const { p: p2 } = puertos({ filas: [{ id: ENL, polizaId: P_MIA, polizaDeclaradaId: null, estado: 'rechazado', origen: 'propuesta_direccion' }] })
  const s2 = (await segurosDeInmueble(p2, INM))!
  assert.equal(s2.estado, 'sin_mirar')
  assert.deepEqual(s2.propuestas, [])
  assert.ok(s2.enlazables.some((x) => x.id === P_MIA), 'un «No es este» se puede corregir a mano')
})

test('declaración «no tiene seguro» y fuentes ilegibles se dicen', async () => {
  const { p } = puertos({ inm: inmueble({ sinSeguroDeclaradoEn: new Date('2026-10-12T09:00:00Z') }), declaradas: null })
  const s = (await segurosDeInmueble(p, INM))!
  assert.equal(s.estado, 'sin_seguro')
  assert.equal(s.sinSeguroDeclaradoEn, '2026-10-12')
  assert.equal(s.sinComprobar, true)
})

test('Inicio: estados de todos los inmuebles con la MISMA regla; sin ver la póliza → sin comprobar', () => {
  const inmuebles = [
    { id: 'a', sinSeguroDeclaradoEn: null },
    { id: 'b', sinSeguroDeclaradoEn: new Date() },
    { id: 'c', sinSeguroDeclaradoEn: null },
    { id: 'd', sinSeguroDeclaradoEn: null },
  ]
  const filas = [
    { inmuebleId: 'a', id: 'e1', polizaId: P_MIA, polizaDeclaradaId: null, estado: 'confirmado', origen: 'manual' },
    { inmuebleId: 'c', id: 'e2', polizaId: P_AJENA, polizaDeclaradaId: null, estado: 'confirmado', origen: 'manual' },
  ]
  assert.deepEqual(estadosDeInmuebles(inmuebles, filas, [hogar]), ['con_seguro', 'sin_seguro', 'enlazado_sin_comprobar', 'sin_mirar'])
  // Cartera ilegible (lista vacía): nada se vuelve «sin seguro».
  assert.deepEqual(estadosDeInmuebles(inmuebles, filas, []), ['enlazado_sin_comprobar', 'sin_seguro', 'enlazado_sin_comprobar', 'sin_mirar'])
})

test('declarada propia por referencia catastral → propuesta_refcat', async () => {
  const dec: PolizaVisible = { ...hogar, tipo: 'declarada', id: D_MIA, ubicacion: null, referenciaCatastral: '9872023VH5797S0001WX' }
  const { p } = puertos({ cartera: [], declaradas: [dec] })
  const s = (await segurosDeInmueble(p, INM))!
  assert.deepEqual(s.propuestas.map((x) => [x.tipo, x.id, x.origen]), [['declarada', D_MIA, 'propuesta_refcat']])
})
