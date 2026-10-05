import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  MAX_DATOS_BORRADOR,
  borradorServidorPara,
  elegirMasReciente,
  interpretarLecturaServidor,
  revisarCuerpoBorrador,
  textoIndicador,
  type FilaServidor,
} from './borrador-servidor.ts'

const C = '11111111-1111-4111-8111-111111111111'
const OP = '22222222-2222-4222-8222-222222222222'
const OP2 = '33333333-3333-4333-8333-333333333333'

test('elegirMasReciente: gana el sello mayor; con un lado vacío, el otro', () => {
  const local = { datos: { matricula: 'L' }, guardadoEn: 1_000 }
  const srv = { datos: { matricula: 'S' }, guardadoEn: 2_000 }
  assert.equal(elegirMasReciente(local, srv)?.origen, 'servidor')
  assert.equal(elegirMasReciente({ ...local, guardadoEn: 3_000 }, srv)?.origen, 'local')
  assert.equal(elegirMasReciente(null, srv)?.origen, 'servidor')
  assert.equal(elegirMasReciente(local, null)?.origen, 'local')
  assert.equal(elegirMasReciente(null, null), null)
})

test('🪤 empate de sellos: se queda lo LOCAL (ya está pintado; no se repinta)', () => {
  const r = elegirMasReciente({ datos: { a: 1 }, guardadoEn: 5 }, { datos: { a: 2 }, guardadoEn: 5 })
  assert.equal(r?.origen, 'local')
})

test('borradorServidorPara: la fila propia manda; con oportunidad y sin propia, la «sin oportunidad»', () => {
  const filas: FilaServidor[] = [
    { oportunidadId: null, datos: { x: 'sin' }, guardadoEn: 10 },
    { oportunidadId: OP, datos: { x: 'op' }, guardadoEn: 5 },
  ]
  assert.deepEqual(borradorServidorPara(filas, OP)?.datos, { x: 'op' })
  assert.deepEqual(borradorServidorPara(filas, OP2)?.datos, { x: 'sin' })
  assert.deepEqual(borradorServidorPara(filas, null)?.datos, { x: 'sin' })
})

test('borradorServidorPara: sin oportunidad y sin propia, la variante MÁS RECIENTE; ilegibles no cuentan', () => {
  const filas: FilaServidor[] = [
    { oportunidadId: OP, datos: { x: 'vieja' }, guardadoEn: 5 },
    { oportunidadId: OP2, datos: { x: 'nueva' }, guardadoEn: 9 },
    { oportunidadId: null, datos: null, guardadoEn: 50 },
  ]
  assert.deepEqual(borradorServidorPara(filas, undefined)?.datos, { x: 'nueva' })
  assert.equal(borradorServidorPara([], null), null)
})

test('🪤 interpretarLecturaServidor: un fallo es null, NUNCA [] («no hay»)', () => {
  assert.equal(interpretarLecturaServidor(503, { estado: 'error' }), null)
  assert.equal(interpretarLecturaServidor(200, null), null)
  assert.equal(interpretarLecturaServidor(200, { estado: 'ok' }), null)
  assert.deepEqual(interpretarLecturaServidor(200, { estado: 'ok', borradores: [] }), [])
  const r = interpretarLecturaServidor(200, {
    borradores: [
      { oportunidadId: null, datos: { a: 1 }, guardadoEn: 7 },
      { oportunidadId: OP, datos: null, guardadoEn: 8 },
      { oportunidadId: 3, datos: {}, guardadoEn: 9 },
      { oportunidadId: null, datos: {}, guardadoEn: 'ayer' },
    ],
  })
  assert.deepEqual(r, [
    { oportunidadId: null, datos: { a: 1 }, guardadoEn: 7 },
    { oportunidadId: OP, datos: null, guardadoEn: 8 },
  ])
})

test('revisarCuerpoBorrador: acepta lo bueno y normaliza la oportunidad vacía a null', () => {
  const r = revisarCuerpoBorrador({ clienteId: C, oportunidadId: '', ramo: 'auto', datos: { matricula: '1234ABC' }, guardadoEn: 1_790_000_000_000 })
  assert.ok(r.ok)
  assert.equal(r.ok && r.valor.oportunidadId, null)
})

test('🪤 revisarCuerpoBorrador: rechaza ids raros, ramo desconocido, datos no-objeto, sello falso y tamaño', () => {
  const base = { clienteId: C, ramo: 'auto', datos: {}, guardadoEn: 1_790_000_000_000 }
  assert.equal(revisarCuerpoBorrador(null).ok, false)
  assert.equal(revisarCuerpoBorrador({ ...base, clienteId: 'x' }).ok, false)
  assert.equal(revisarCuerpoBorrador({ ...base, oportunidadId: "1' or 1=1" }).ok, false)
  assert.equal(revisarCuerpoBorrador({ ...base, ramo: 'rc' }).ok, false)
  assert.equal(revisarCuerpoBorrador({ ...base, datos: [] }).ok, false)
  assert.equal(revisarCuerpoBorrador({ ...base, guardadoEn: '1790000000000' }).ok, false)
  assert.equal(revisarCuerpoBorrador({ ...base, datos: { x: 'a'.repeat(MAX_DATOS_BORRADOR) } }).ok, false)
})

test('textoIndicador: los tres mensajes y nada antes de intentarlo', () => {
  assert.equal(textoIndicador(null), null)
  assert.equal(textoIndicador({ tipo: 'solo_local' }), 'Sin conexión: guardado en este equipo')
  // 09:05 UTC del 5/10/2026 = 11:05 en Madrid (horario de verano).
  assert.equal(textoIndicador({ tipo: 'guardado', en: Date.UTC(2026, 9, 5, 9, 5) }), 'Guardado ✓ 11:05')
})
