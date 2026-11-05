// CEPO de la solicitud de datos de la renovación (05/11/2026): QUIÉN la ve y la contesta. Si una persona sin nivel de operar,
// de otra ficha, con solo consulta, con una autorización revocada/caducada o de otra póliza pudiera contestarla, esto se pone en
// rojo. Datos sintéticos (ids de ejemplo, sin personas reales).
import { test } from 'node:test'
import assert from 'node:assert/strict'

import { quienContestaDatosRenovacion, textoQuienContesto } from './datos-renovacion.ts'
import { avisosDe } from './avisos.ts'
import type { FilaAutorizacionRenovacion } from './renovacion-eleccion.ts'

const AHORA = new Date('2026-11-05T10:00:00Z')
const AYER = new Date('2026-11-04T10:00:00Z')
const YO = '00000000-0000-4000-8000-0000000000a1'
const OTRA = '00000000-0000-4000-8000-0000000000b2'
const POLIZA = '00000000-0000-4000-8000-00000000c0c0'
const OTRA_POLIZA = '00000000-0000-4000-8000-00000000d0d0'

const fila = (cambio: Partial<FilaAutorizacionRenovacion> = {}): FilaAutorizacionRenovacion => ({
  autorizacionId: 'a1', alcance: 'gestion', aceptadoEn: AYER, caducaEn: null, revocadoEn: null, polizaId: POLIZA, polizaFusionadaEn: null,
  identidadId: YO, nivelVinculo: null, nombre: 'Ejemplo Persona', ...cambio,
})
const quien = (e: Partial<Parameters<typeof quienContestaDatosRenovacion>[0]>) =>
  quienContestaDatosRenovacion({ identidadId: YO, vinculo: null, filas: [], polizaId: POLIZA, ahora: AHORA, ...e })

test('el TOMADOR con nivel de operar contesta', () => {
  assert.deepEqual(quien({ vinculo: { nivel: 'gestionar', origen: 'email_hash' } }), { papel: 'tomador' })
  assert.deepEqual(quien({ vinculo: { nivel: 'administrar', origen: 'manual' } }), { papel: 'tomador' })
})

test('el tomador que SOLO VE (tarjeta/completo) no contesta; la vista de corredor tampoco', () => {
  assert.equal(quien({ vinculo: { nivel: 'tarjeta', origen: 'email_hash' } }), null)
  assert.equal(quien({ vinculo: { nivel: 'completo', origen: 'email_hash' } }), null)
  assert.equal(quien({ vinculo: { nivel: 'administrar', origen: 'corredor' } }), null)
  assert.equal(quien({ vinculo: { nivel: 'raro', origen: 'email_hash' } }), null)
})

test('el AUTORIZADO con Gestión o Total, vigente y de esta póliza (o de toda la ficha), contesta', () => {
  assert.deepEqual(quien({ filas: [fila()] }), { papel: 'autorizado', nombre: 'Ejemplo Persona' })
  assert.deepEqual(quien({ filas: [fila({ alcance: 'total', polizaId: null })] }), { papel: 'autorizado', nombre: 'Ejemplo Persona' })
})

test('sin nivel de operar, de OTRA ficha/persona o de otra póliza: NADIE', () => {
  assert.equal(quien({}), null, 'sin vínculo ni autorización')
  assert.equal(quien({ filas: [fila({ alcance: 'ver_economico' })] }), null, 'solo consulta')
  assert.equal(quien({ filas: [fila({ alcance: 'ver' })] }), null, 'solo ver')
  assert.equal(quien({ filas: [fila({ identidadId: OTRA })] }), null, 'la autorización es de OTRA identidad')
  assert.equal(quien({ filas: [fila({ polizaId: OTRA_POLIZA })] }), null, 'autorización de otra póliza')
  assert.equal(quien({ filas: [fila({ revocadoEn: AYER })] }), null, 'revocada')
  assert.equal(quien({ filas: [fila({ aceptadoEn: null })] }), null, 'sin aceptar')
  assert.equal(quien({ filas: [fila({ caducaEn: AYER })] }), null, 'caducada')
  assert.equal(quien({ filas: [fila({ nivelVinculo: 'completo' })] }), null, 'llega por una ficha cuyo vínculo no opera')
  assert.equal(quien({ filas: [fila({ vinculoDeCorredor: true })] }), null, 'vista de corredor')
  assert.equal(quien({ filas: [fila({ alcance: 'desconocido' })] }), null, 'alcance desconocido')
  assert.equal(quien({ identidadId: '  ', vinculo: { nivel: 'gestionar', origen: 'email_hash' } }), null, 'sin identidad')
})

test('el texto de quién contestó: sin apellidos ni datos', () => {
  assert.equal(textoQuienContesto({ papel: 'tomador' }), 'el tomador, por la app')
  assert.match(textoQuienContesto({ papel: 'autorizado', nombre: 'Ejemplo Persona' }), /^Ejemplo \(autorizado/)
})

test('campana: el aviso lleva el texto de Alberto y la página; ilegible ≠ «no hay»', () => {
  const a = avisosDe({ autorizaciones: { otorgadas: [], recibidas: [] }, obligaciones: [], peticiones: [], datos: [], carnets: [], firmas: [], datosRenovacion: [{ id: 'abc' }], hoy: AHORA })
  const d = a.avisos.find((x) => x.tipo === 'datos_renovacion')
  assert.ok(d)
  assert.equal(d?.titulo, 'Estamos revisando la renovación de tu seguro de hogar; necesitamos unos datos')
  assert.equal(d?.href, '/boveda/datos-renovacion/abc')
  assert.equal(d?.descartable, false, 'se va sola al contestar')
  const ilegible = avisosDe({ autorizaciones: { otorgadas: [], recibidas: [] }, obligaciones: [], peticiones: [], datos: [], carnets: [], firmas: [], datosRenovacion: null, hoy: AHORA })
  assert.ok(ilegible.fuentesIlegibles.includes('datos_renovacion'))
})
