import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  declaradaVigente,
  estadoSeguroInmueble,
  mismaDireccion,
  normalizarRefCatastral,
  origenAEscribir,
  proponerEnlaces,
  resumenSegurosPatrimonio,
  type CandidataEnlace,
  type EnlaceSeguro,
  type InmuebleParaEnlace,
} from './enlace-seguro.ts'

const DIA = new Date('2026-10-12T10:00:00Z')
const enl = (x: Partial<EnlaceSeguro>): EnlaceSeguro => ({ estado: 'confirmado', archivado: false, vigente: true, ...x })

test('tres estados: nada dicho es «sin mirar», nunca «sin seguro»', () => {
  assert.equal(estadoSeguroInmueble({ enlaces: [], sinSeguroDeclaradoEn: null }), 'sin_mirar')
  assert.equal(estadoSeguroInmueble({ enlaces: [], sinSeguroDeclaradoEn: DIA }), 'sin_seguro')
  assert.equal(estadoSeguroInmueble({ enlaces: [enl({})], sinSeguroDeclaradoEn: null }), 'con_seguro')
})

test('un enlace confirmado vigente gana a la declaración «no tiene seguro»', () => {
  assert.equal(estadoSeguroInmueble({ enlaces: [enl({})], sinSeguroDeclaradoEn: DIA }), 'con_seguro')
})

test('🚨 vigencia sin comprobar NO se lee como vigente ni como no vigente, y no la pisa la declaración', () => {
  assert.equal(estadoSeguroInmueble({ enlaces: [enl({ vigente: null })], sinSeguroDeclaradoEn: null }), 'enlazado_sin_comprobar')
  assert.equal(estadoSeguroInmueble({ enlaces: [enl({ vigente: null })], sinSeguroDeclaradoEn: DIA }), 'enlazado_sin_comprobar')
  assert.equal(
    estadoSeguroInmueble({ enlaces: [enl({ vigente: null }), enl({ vigente: true })], sinSeguroDeclaradoEn: null }),
    'con_seguro',
  )
})

test('enlaces confirmados que ya no están en vigor → derivado; con declaración posterior → sin seguro', () => {
  assert.equal(estadoSeguroInmueble({ enlaces: [enl({ vigente: false })], sinSeguroDeclaradoEn: null }), 'con_seguro_no_vigente')
  assert.equal(estadoSeguroInmueble({ enlaces: [enl({ vigente: false })], sinSeguroDeclaradoEn: DIA }), 'sin_seguro')
})

test('rechazados, archivados y estados desconocidos no cuentan (fail-closed)', () => {
  for (const e of [enl({ estado: 'rechazado' }), enl({ archivado: true }), enl({ estado: 'CONFIRMADO' }), enl({ estado: '' })]) {
    assert.equal(estadoSeguroInmueble({ enlaces: [e], sinSeguroDeclaradoEn: null }), 'sin_mirar', JSON.stringify(e))
  }
})

test('resumen de Inicio: cada inmueble en UN cubo; «sin comprobar» no es ni asegurado ni sin seguro', () => {
  const r = resumenSegurosPatrimonio(['con_seguro', 'sin_seguro', 'con_seguro_no_vigente', 'sin_mirar', 'enlazado_sin_comprobar'])
  assert.deepEqual(r, { inmuebles: 5, conSeguro: 1, sinSeguroQueNosConste: 2, sinRevisar: 1, sinComprobar: 1 })
  assert.deepEqual(resumenSegurosPatrimonio([]), { inmuebles: 0, conSeguro: 0, sinSeguroQueNosConste: 0, sinRevisar: 0, sinComprobar: 0 })
})

test('referencia catastral: solo la de 20 del inmueble; la de 14 (finca) no casa', () => {
  assert.equal(normalizarRefCatastral(' 9872023 vh5797s 0001 wx '), '9872023VH5797S0001WX')
  assert.equal(normalizarRefCatastral('9872023-VH5797S-0001-WX'), '9872023VH5797S0001WX')
  assert.equal(normalizarRefCatastral('9872023VH5797S'), null)
  assert.equal(normalizarRefCatastral(''), null)
  assert.equal(normalizarRefCatastral(null), null)
})

const SOCORRO: InmuebleParaEnlace = { referenciaCatastral: '9872023VH5797S0001WX', cp: '41003', via: 'Calle Socorro', numero: '24' }

test('dirección: CP + vía + número, y la vía sin «Calle/C/ del»', () => {
  assert.equal(mismaDireccion(SOCORRO, 'C/ del Socorro, 24, 2ºB, 41003 Sevilla'), true)
  assert.equal(mismaDireccion(SOCORRO, 'CALLE SOCORRO 24, 41003 SEVILLA'), true)
  assert.equal(mismaDireccion({ ...SOCORRO, numero: '24B' }, 'Calle Socorro 24 B, 41003 Sevilla'), true)
})

test('🚨 dirección: cualquier hueco es «no casa» (otro número, otro CP, sin CP, sin número, solo municipio)', () => {
  assert.equal(mismaDireccion(SOCORRO, 'Calle Socorro 22, 41003 Sevilla'), false, 'otro número')
  assert.equal(mismaDireccion(SOCORRO, 'Calle Socorro 240, 41003 Sevilla'), false, 'número que empieza igual')
  assert.equal(mismaDireccion(SOCORRO, 'Calle Socorro 24, 41004 Sevilla'), false, 'otro CP')
  assert.equal(mismaDireccion(SOCORRO, 'Calle Socorro 24, Sevilla'), false, 'sin CP en la póliza')
  assert.equal(mismaDireccion({ ...SOCORRO, cp: null }, 'Calle Socorro 24, 41003 Sevilla'), false, 'sin CP en el inmueble')
  assert.equal(mismaDireccion({ ...SOCORRO, numero: 's/n' }, 'Calle Socorro s/n, 41003 Sevilla'), false, 'sin número')
  assert.equal(mismaDireccion(SOCORRO, '41003 Sevilla'), false, 'solo municipio')
  assert.equal(mismaDireccion(SOCORRO, 'Calle Bustos Tavera 24, 41003 Sevilla'), false, 'otra calle, mismo número')
  assert.equal(mismaDireccion({ ...SOCORRO, via: 'Calle' }, 'Calle 24, 41003 Sevilla'), false, 'vía vacía tras quitar el tipo')
})

test('🚨 dirección no visible en el nivel de quien mira (null) → no hay propuesta por dirección', () => {
  const c: CandidataEnlace = { tipo: 'cartera', id: 'p1', ramo: 'hogar', referenciaCatastral: null, ubicacion: null }
  assert.deepEqual(proponerEnlaces(SOCORRO, [c], []), [])
})

test('propuestas: refcat primero, dirección después, solo ramos de inmueble y nunca un par ya decidido', () => {
  const cands: CandidataEnlace[] = [
    { tipo: 'declarada', id: 'd1', ramo: 'hogar', referenciaCatastral: '9872023vh5797s0001wx', ubicacion: null },
    { tipo: 'cartera', id: 'p1', ramo: 'hogar', referenciaCatastral: null, ubicacion: 'Calle Socorro 24, 41003 Sevilla' },
    { tipo: 'cartera', id: 'p2', ramo: 'auto', referenciaCatastral: null, ubicacion: 'Calle Socorro 24, 41003 Sevilla' },
    { tipo: 'cartera', id: 'p3', ramo: 'comunidades', referenciaCatastral: null, ubicacion: 'Calle Socorro 24, 41003 Sevilla' },
    { tipo: 'cartera', id: 'p1', ramo: 'hogar', referenciaCatastral: null, ubicacion: 'Calle Socorro 24, 41003 Sevilla' },
  ]
  assert.deepEqual(proponerEnlaces(SOCORRO, cands, [{ tipo: 'cartera', id: 'p3' }]), [
    { tipo: 'declarada', id: 'd1', origen: 'propuesta_refcat' },
    { tipo: 'cartera', id: 'p1', origen: 'propuesta_direccion' },
  ])
})

test('el mismo id en cartera y en declarada son pólizas distintas', () => {
  const cands: CandidataEnlace[] = [
    { tipo: 'declarada', id: 'x', ramo: 'hogar', referenciaCatastral: SOCORRO.referenciaCatastral, ubicacion: null },
    { tipo: 'cartera', id: 'x', ramo: 'hogar', referenciaCatastral: null, ubicacion: 'Calle Socorro 24, 41003 Sevilla' },
  ]
  assert.equal(proponerEnlaces(SOCORRO, cands, [{ tipo: 'declarada', id: 'x' }]).length, 1)
})

test('origen a escribir: solo se cree «propuesta_*» si el servidor propone ESE par con ESE origen', () => {
  const props = [{ tipo: 'cartera' as const, id: 'p1', origen: 'propuesta_direccion' as const }]
  assert.equal(origenAEscribir('propuesta_direccion', { tipo: 'cartera', id: 'p1' }, props), 'propuesta_direccion')
  assert.equal(origenAEscribir('propuesta_refcat', { tipo: 'cartera', id: 'p1' }, props), 'manual')
  assert.equal(origenAEscribir('propuesta_direccion', { tipo: 'declarada', id: 'p1' }, props), 'manual')
  assert.equal(origenAEscribir('cualquiera', { tipo: 'cartera', id: 'p1' }, props), 'manual')
  assert.equal(origenAEscribir(undefined, { tipo: 'cartera', id: 'p1' }, props), 'manual')
})

test('declarada vigente: quitada o «no» → no; vencida → no salvo «sí»; sin fecha → la aportó y no la ha quitado', () => {
  const hoy = new Date('2026-10-24T12:00:00Z')
  const d = (x: Partial<{ eliminadaEn: Date | null; fechaVencimiento: Date | null; vigenteDeclarada: string | null }>) => ({
    eliminadaEn: null, fechaVencimiento: null, vigenteDeclarada: null, ...x,
  })
  assert.equal(declaradaVigente(d({}), hoy), true)
  assert.equal(declaradaVigente(d({ eliminadaEn: hoy }), hoy), false)
  assert.equal(declaradaVigente(d({ vigenteDeclarada: 'no' }), hoy), false)
  assert.equal(declaradaVigente(d({ fechaVencimiento: new Date('2026-10-24T00:00:00Z') }), hoy), true, 'vence hoy: aún vale')
  assert.equal(declaradaVigente(d({ fechaVencimiento: new Date('2026-10-23T00:00:00Z') }), hoy), false)
  assert.equal(declaradaVigente(d({ fechaVencimiento: new Date('2026-10-23T00:00:00Z'), vigenteDeclarada: 'si' }), hoy), true)
  assert.equal(declaradaVigente(d({ fechaVencimiento: new Date('2026-10-23T00:00:00Z'), vigenteDeclarada: 'no_sabe' }), hoy), false)
})
