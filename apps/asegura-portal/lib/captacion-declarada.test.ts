import test from 'node:test'
import assert from 'node:assert/strict'

import {
  claveAhoraNo,
  clavePedida,
  DIAS_AHORA_NO,
  estadoCaptacion,
  mensajePeticionGestion,
  PREFIJO_CAPTACION,
} from './captacion-declarada.ts'

const P = '11111111-1111-4111-8111-111111111111'
const OTRA = '22222222-2222-4222-8222-222222222222'
const AHORA = new Date('2026-10-13T10:00:00Z')
const hace = (dias: number) => new Date(AHORA.getTime() - dias * 24 * 60 * 60 * 1000)
const base = { propia: true, eliminada: false, polizaId: P, marcas: [], ahora: AHORA }

test('propia y viva sin marcas: se ofrece', () => {
  assert.equal(estadoCaptacion(base), 'ofrecer')
})

test('la de un titular que dio acceso o la eliminada: nunca se ofrece', () => {
  assert.equal(estadoCaptacion({ ...base, propia: false }), 'oculta')
  assert.equal(estadoCaptacion({ ...base, eliminada: true }), 'oculta')
  // ni siquiera con una petición ya hecha
  assert.equal(estadoCaptacion({ ...base, propia: false, marcas: [{ clave: clavePedida(P), creadoEn: AHORA }] }), 'oculta')
})

test('«Ahora no» oculta 90 días y luego vuelve', () => {
  const dentro = [{ clave: claveAhoraNo(P, hace(DIAS_AHORA_NO - 1)), creadoEn: hace(DIAS_AHORA_NO - 1) }]
  const fuera = [{ clave: claveAhoraNo(P, hace(DIAS_AHORA_NO + 1)), creadoEn: hace(DIAS_AHORA_NO + 1) }]
  assert.equal(estadoCaptacion({ ...base, marcas: dentro }), 'oculta')
  assert.equal(estadoCaptacion({ ...base, marcas: fuera }), 'ofrecer')
  // una pulsación nueva tras caducar la anterior vuelve a ocultar
  assert.equal(estadoCaptacion({ ...base, marcas: [...fuera, { clave: claveAhoraNo(P, AHORA), creadoEn: AHORA }] }), 'oculta')
})

test('«Ahora no» de otra póliza no oculta ésta', () => {
  assert.equal(estadoCaptacion({ ...base, marcas: [{ clave: claveAhoraNo(OTRA, AHORA), creadoEn: AHORA }] }), 'ofrecer')
})

test('petición ya hecha: «ya_pedida», también si había un «Ahora no»', () => {
  const marcas = [
    { clave: claveAhoraNo(P, hace(3)), creadoEn: hace(3) },
    { clave: clavePedida(P), creadoEn: hace(1) },
  ]
  assert.equal(estadoCaptacion({ ...base, marcas }), 'ya_pedida')
  assert.equal(estadoCaptacion({ ...base, marcas: [{ clave: clavePedida(OTRA), creadoEn: AHORA }] }), 'ofrecer')
})

test('las claves comparten prefijo para pedirlas juntas a la BD', () => {
  assert.ok(clavePedida(P).startsWith(PREFIJO_CAPTACION))
  assert.ok(claveAhoraNo(P, AHORA).startsWith(PREFIJO_CAPTACION))
})

test('el aviso lleva id y datos básicos, escapa HTML y no inventa vencimiento', () => {
  const m = mensajePeticionGestion({
    identidadId: 'i1', nombre: null, polizaId: P, compania: 'A<&>B', ramo: 'hogar', numeroPoliza: null, fechaVencimiento: null,
  })
  assert.ok(m.includes(P) && m.includes('A&lt;&amp;&gt;B') && m.includes('hogar'))
  assert.ok(m.includes('Sin vencimiento indicado'))
  assert.ok(!m.includes('A<&>B'))
})
