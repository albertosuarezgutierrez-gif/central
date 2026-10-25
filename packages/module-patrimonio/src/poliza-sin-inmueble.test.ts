import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  estadoPeticionAviso,
  polizasSinInmueble,
  precargaDeUbicacion,
  type EnlaceParaAvisoPoliza,
  type InmuebleParaAvisoPoliza,
  type PolizaParaAvisoInmueble,
} from './poliza-sin-inmueble.ts'

const REF = '1234567VK1234S0001AB'
const pol = (x: Partial<PolizaParaAvisoInmueble> = {}): PolizaParaAvisoInmueble => ({
  tipo: 'cartera', id: 'p1', ramo: 'hogar', vigente: true, ubicacion: 'CALLE SOCORRO 24, 41003 SEVILLA',
  referenciaCatastral: null, puedeAnadir: true, ...x,
})
const inm = (x: Partial<InmuebleParaAvisoPoliza> = {}): InmuebleParaAvisoPoliza => ({
  id: 'i1', referenciaCatastral: null, cp: '41003', via: 'Socorro', numero: '24', puedeEnlazar: true, ...x,
})
const enl = (x: Partial<EnlaceParaAvisoPoliza> = {}): EnlaceParaAvisoPoliza => ({
  inmuebleId: 'i1', tipo: 'cartera', polizaId: 'p1', estado: 'confirmado', archivado: false, ...x,
})
const una = (x: Parameters<typeof polizasSinInmueble>[0]) => polizasSinInmueble(x)

test('hogar vigente con ubicación y sin inmueble que case → proponer añadir', () => {
  const r = una({ polizas: [pol()], inmuebles: [], enlaces: [] })
  assert.equal(r.length, 1)
  assert.deepEqual(r[0]!.propuesta, { accion: 'anadir' })
  assert.equal(r[0]!.ubicacion, 'CALLE SOCORRO 24, 41003 SEVILLA')
})

test('si ya hay un inmueble que casa por dirección → enlazar con su origen', () => {
  const r = una({ polizas: [pol()], inmuebles: [inm()], enlaces: [] })
  assert.deepEqual(r[0]!.propuesta, { accion: 'enlazar', inmuebleId: 'i1', origen: 'propuesta_direccion' })
})

test('declarada con referencia catastral idéntica → enlazar por refcat (cuenta igual que la cartera)', () => {
  const r = una({
    polizas: [pol({ tipo: 'declarada', id: 'd1', ubicacion: null, referenciaCatastral: REF.toLowerCase() })],
    inmuebles: [inm({ referenciaCatastral: REF, cp: null, via: null, numero: null })],
    enlaces: [],
  })
  assert.deepEqual(r[0]!.propuesta, { accion: 'enlazar', inmuebleId: 'i1', origen: 'propuesta_refcat' })
  assert.equal(r[0]!.referenciaCatastral, REF)
})

test('🚨 la cartera NO aporta refcat: una refcat colada en una póliza de cartera no se usa', () => {
  const r = una({ polizas: [pol({ ubicacion: null, referenciaCatastral: REF })], inmuebles: [], enlaces: [] })
  assert.equal(r.length, 0)
})

test('🚨 sin ubicación visible ni refcat (nivel tarjeta, tercero persona física) no se dice nada', () => {
  assert.equal(una({ polizas: [pol({ ubicacion: null })], inmuebles: [], enlaces: [] }).length, 0)
  assert.equal(una({ polizas: [pol({ ubicacion: '   ' })], inmuebles: [], enlaces: [] }).length, 0)
})

test('ya enlazada (confirmado vivo) a cualquier inmueble → no es una póliza suelta', () => {
  assert.equal(una({ polizas: [pol()], inmuebles: [inm()], enlaces: [enl()] }).length, 0)
  assert.equal(una({ polizas: [pol()], inmuebles: [], enlaces: [enl({ inmuebleId: 'otro' })] }).length, 0)
})

test('un enlace ARCHIVADO no cuenta: la póliza vuelve a estar suelta', () => {
  assert.equal(una({ polizas: [pol()], inmuebles: [], enlaces: [enl({ archivado: true })] }).length, 1)
})

test('«No es este» contra el inmueble que casa: no se vuelve a proponer nada (ni enlazar ni añadir)', () => {
  assert.equal(una({ polizas: [pol()], inmuebles: [inm()], enlaces: [enl({ estado: 'rechazado' })] }).length, 0)
})

test('«No es este» contra uno, pero otro inmueble sí casa → se propone el otro', () => {
  const r = una({
    polizas: [pol()],
    inmuebles: [inm({ id: 'i1' }), inm({ id: 'i2' })],
    enlaces: [enl({ estado: 'rechazado' })],
  })
  assert.deepEqual(r[0]!.propuesta, { accion: 'enlazar', inmuebleId: 'i2', origen: 'propuesta_direccion' })
})

test('🚨 sin nivel no se ofrece: enlazar exige puedeEnlazar y añadir exige puedeAnadir', () => {
  assert.equal(una({ polizas: [pol()], inmuebles: [inm({ puedeEnlazar: false })], enlaces: [] }).length, 0)
  assert.equal(una({ polizas: [pol({ puedeAnadir: false })], inmuebles: [], enlaces: [] }).length, 0)
})

test('solo hogar/comunidad: auto, vida, comercio… no', () => {
  for (const ramo of ['auto', 'vida', 'comercio', 'salud', null]) {
    assert.equal(una({ polizas: [pol({ ramo })], inmuebles: [], enlaces: [] }).length, 0, String(ramo))
  }
  assert.equal(una({ polizas: [pol({ ramo: 'Comunidades' })], inmuebles: [], enlaces: [] }).length, 1)
})

test('🚨 solo en vigor: false y null (sin comprobar) se callan', () => {
  assert.equal(una({ polizas: [pol({ vigente: false })], inmuebles: [], enlaces: [] }).length, 0)
  assert.equal(una({ polizas: [pol({ vigente: null })], inmuebles: [], enlaces: [] }).length, 0)
})

test('una póliza sale una vez aunque llegue repetida; cartera y declarada con el mismo id son distintas', () => {
  assert.equal(una({ polizas: [pol(), pol()], inmuebles: [], enlaces: [] }).length, 1)
  assert.equal(una({ polizas: [pol(), pol({ tipo: 'declarada' })], inmuebles: [], enlaces: [] }).length, 2)
})

test('precarga: CP y calle con número; el municipio no se adivina', () => {
  assert.deepEqual(precargaDeUbicacion('CALLE SOCORRO 24, 41003 SEVILLA'), { cp: '41003', direccion: 'CALLE SOCORRO 24' })
  assert.deepEqual(precargaDeUbicacion('41003 Calle Socorro 24'), { cp: '41003', direccion: 'Calle Socorro 24' })
  assert.deepEqual(precargaDeUbicacion('Calle Socorro 24'), { cp: '', direccion: 'Calle Socorro 24' })
  assert.deepEqual(precargaDeUbicacion(null), { cp: '', direccion: '' })
  // Un número de 6 cifras no es un CP.
  assert.equal(precargaDeUbicacion('Camino 123456').cp, '')
})

test('petición abierta: gana a una fuente caída; fuente caída sin hallazgo = sin comprobar, nunca libre', () => {
  const base = { tipo: 'cartera' as const, polizaId: 'p1', inmuebleId: null }
  assert.deepEqual(estadoPeticionAviso({ ...base, deMejorarPrecio: [], dePedirPrecio: null }), { estado: 'libre' })
  assert.deepEqual(estadoPeticionAviso({ ...base, deMejorarPrecio: [{ polizaId: 'p1', pedidoEl: '2026-10-20' }], dePedirPrecio: null }), { estado: 'pedida', el: '2026-10-20' })
  assert.deepEqual(estadoPeticionAviso({ ...base, deMejorarPrecio: null, dePedirPrecio: [] }), { estado: 'sin_comprobar' })
  const conInm = { ...base, inmuebleId: 'i1' }
  assert.deepEqual(estadoPeticionAviso({ ...conInm, deMejorarPrecio: [], dePedirPrecio: null }), { estado: 'sin_comprobar' })
  assert.deepEqual(estadoPeticionAviso({ ...conInm, deMejorarPrecio: [], dePedirPrecio: [{ inmuebleId: 'i1', pedidoEl: '2026-10-22' }] }), { estado: 'pedida', el: '2026-10-22' })
  assert.deepEqual(estadoPeticionAviso({ ...conInm, deMejorarPrecio: [], dePedirPrecio: [{ inmuebleId: 'i2', pedidoEl: '2026-10-22' }] }), { estado: 'libre' })
})

test('una declarada no necesita la fuente de «mejorar precio»: caída no la bloquea', () => {
  assert.deepEqual(estadoPeticionAviso({ tipo: 'declarada', polizaId: 'd1', inmuebleId: null, deMejorarPrecio: null, dePedirPrecio: null }), { estado: 'libre' })
})
