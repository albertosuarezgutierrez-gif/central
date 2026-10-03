// Cepos del aviso del descubrimiento de emisiones (03/10/2026): qué se lee de asegura, cuándo se
// avisa por Telegram (y cuándo NO, para no repetir cada media hora) y que el mensaje no lleve PII.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import {
  PREFIJO_CREDENCIALES,
  decidirDescubrimiento,
  esPrimeraPasadaDelDia,
  interpretarDescubrimiento,
  type Descubrimiento,
} from './descubrir-emisiones-aviso.ts'

const BASE = 'https://plataforma.test'
const OK = {
  estado: 'ok', revisados: 3, acunadas: 0, registradas: 0, revisionNuevas: 0, desconocidosNuevos: 0,
  colaAbierta: 0, colaPorMotivo: {}, pendientesPorTope: 0, truncado: false, errores: [],
}
const ok = (extra: Record<string, unknown> = {}) => interpretarDescubrimiento(200, { ...OK, ...extra })
// 10:00 de Madrid (no es la primera pasada del día).
const MEDIODIA = new Date('2026-10-03T08:00:00Z')

test('interpretar: un campo que falta es ilegible, nunca un 0', () => {
  const { colaAbierta: _, ...sinCola } = OK
  assert.deepEqual(interpretarDescubrimiento(200, sinCola), { estado: 'error', motivo: 'respuesta_ilegible' })
  assert.deepEqual(interpretarDescubrimiento(200, { ...OK, acunadas: null }), { estado: 'error', motivo: 'respuesta_ilegible' })
})

test('interpretar: secreto rechazado, vendor sin configurar y credenciales de Codeoscopic son cosas distintas', () => {
  assert.deepEqual(interpretarDescubrimiento(401, null), { estado: 'error', motivo: 'secreto_rechazado' })
  assert.equal(interpretarDescubrimiento(503, { estado: 'vendor_sin_configurar' }).estado, 'error')
  assert.equal(interpretarDescubrimiento(200, { estado: 'credenciales_rechazadas', motivo: 'vendor:auth 401' }).estado, 'credenciales_rechazadas')
})

test('401 de Codeoscopic: avisa la PRIMERA vez y el latido va en rojo con el prefijo', () => {
  const r: Descubrimiento = { estado: 'credenciales_rechazadas', motivo: 'vendor:auth 401' }
  const d = decidirDescubrimiento({ r, previo: { ok: true, detalle: 'x', ultimoAt: MEDIODIA, ultimoOkAt: MEDIODIA }, ahora: MEDIODIA, base: BASE })
  assert.equal(d.latidoOk, false)
  assert.ok(d.latidoDetalle.startsWith(PREFIJO_CREDENCIALES))
  assert.match(d.mensaje ?? '', /rechaza nuestras credenciales/)
})

test('401 repetido: NO vuelve a avisar cada media hora', () => {
  const r: Descubrimiento = { estado: 'credenciales_rechazadas', motivo: null }
  const ultimoOk = new Date(MEDIODIA.getTime() - 3_600_000)
  const d = decidirDescubrimiento({ r, previo: { ok: false, detalle: `${PREFIJO_CREDENCIALES} (401/403)`, ultimoAt: MEDIODIA, ultimoOkAt: ultimoOk }, ahora: MEDIODIA, base: BASE })
  assert.equal(d.mensaje, null)
})

test('401 sin poder leer el latido anterior: se avisa (fail-open)', () => {
  const d = decidirDescubrimiento({ r: { estado: 'credenciales_rechazadas', motivo: null }, previo: null, ahora: MEDIODIA, base: BASE })
  assert.notEqual(d.mensaje, null)
})

test('más de 6 h sin pasada buena: avisa UNA vez, al cruzar el umbral', () => {
  const ultimoOk = new Date(MEDIODIA.getTime() - 6.5 * 3_600_000)
  const r: Descubrimiento = { estado: 'error_vendor', motivo: 'vendor:servidor 503' }
  const cruza = decidirDescubrimiento({ r, previo: { ok: false, detalle: 'x', ultimoAt: new Date(MEDIODIA.getTime() - 1_800_000), ultimoOkAt: ultimoOk }, ahora: MEDIODIA, base: BASE })
  assert.match(cruza.mensaje ?? '', /más de 6 h/)
  const yaCruzado = decidirDescubrimiento({ r, previo: { ok: false, detalle: 'x', ultimoAt: new Date(MEDIODIA.getTime() - 600_000), ultimoOkAt: new Date(MEDIODIA.getTime() - 8 * 3_600_000) }, ahora: MEDIODIA, base: BASE })
  assert.equal(yaCruzado.mensaje, null)
})

test('pasada buena sin nada nuevo: latido verde y NINGÚN Telegram', () => {
  const d = decidirDescubrimiento({ r: ok({ colaAbierta: 2, colaPorMotivo: { sin_cliente: 2 } }), previo: null, ahora: MEDIODIA, base: BASE })
  assert.equal(d.latidoOk, true)
  assert.equal(d.mensaje, null)
})

test('cola de revisión con algo NUEVO: resumen con el desglose por motivo', () => {
  const d = decidirDescubrimiento({ r: ok({ revisionNuevas: 1, colaAbierta: 3, colaPorMotivo: { sin_cliente: 2, varios_clientes: 1 } }), previo: null, ahora: MEDIODIA, base: BASE })
  assert.match(d.mensaje ?? '', /1<\/b> emisión\(es\) nueva\(s\)/)
  assert.match(d.mensaje ?? '', /2 tomador sin ficha/)
  assert.match(d.mensaje ?? '', /\/correduria/)
})

test('estado desconocido nuevo: avisa', () => {
  const d = decidirDescubrimiento({ r: ok({ desconocidosNuevos: 1, revisionNuevas: 1, colaAbierta: 1, colaPorMotivo: { estado_desconocido: 1 } }), previo: null, ahora: MEDIODIA, base: BASE })
  assert.match(d.mensaje ?? '', /emisión\(es\) con un estado que no se reconoce: hay que mirarlas en Avant2/)
})

test('recordatorio diario: solo en la primera pasada (07:10 de Madrid) y solo si la cola tiene algo', () => {
  const primera = new Date('2026-10-03T05:10:00Z') // 07:10 Madrid (CEST)
  assert.equal(esPrimeraPasadaDelDia(primera), true)
  assert.equal(esPrimeraPasadaDelDia(new Date('2026-10-03T05:40:00Z')), false)
  assert.equal(esPrimeraPasadaDelDia(new Date('2026-12-03T06:10:00Z')), true) // invierno (CET)
  assert.match(decidirDescubrimiento({ r: ok({ colaAbierta: 2, colaPorMotivo: { sin_cliente: 2 } }), previo: null, ahora: primera, base: BASE }).mensaje ?? '', /Siguen <b>2<\/b>/)
  assert.equal(decidirDescubrimiento({ r: ok(), previo: null, ahora: primera, base: BASE }).mensaje, null)
})

test('errores sueltos o lista truncada ponen el latido en rojo (no se vio todo)', () => {
  assert.equal(decidirDescubrimiento({ r: ok({ errores: [{ projectId: '1', mensaje: 'x' }] }), previo: null, ahora: MEDIODIA, base: BASE }).latidoOk, false)
  assert.equal(decidirDescubrimiento({ r: ok({ truncado: true }), previo: null, ahora: MEDIODIA, base: BASE }).latidoOk, false)
})

test('fallo del puerto: latido rojo, nunca «0 emisiones»', () => {
  const d = decidirDescubrimiento({ r: { estado: 'error', motivo: 'red' }, previo: null, ahora: MEDIODIA, base: BASE })
  assert.equal(d.latidoOk, false)
  assert.match(d.latidoDetalle, /no se pudo mirar/)
})

test('el mensaje no lleva PII: ni el aviso ni el módulo interpolan nombres, documentos ni nº de póliza', () => {
  const d = decidirDescubrimiento({ r: ok({ acunadas: 2, revisionNuevas: 1, desconocidosNuevos: 1, colaAbierta: 1, colaPorMotivo: { sin_cliente: 1 } }), previo: null, ahora: new Date('2026-10-03T05:10:00Z'), base: BASE })
  assert.doesNotMatch(d.mensaje ?? '', /\d{8}[A-Z]|póliza nº|POL-/)
  const src = readFileSync(new URL('./descubrir-emisiones-aviso.ts', import.meta.url), 'utf8')
  assert.doesNotMatch(src, /\.(nombre|apellidos|numeroPoliza|dni|documento)\b/)
})

test('la ruta del cron emite el id catalogado y deja latido', () => {
  const src = readFileSync(new URL('../../app/api/cron/correduria-descubrir-emisiones/route.ts', import.meta.url), 'utf8')
  assert.match(src, /tgAviso\('correduria\.emisiones-descubiertas'/)
  assert.match(src, /registrarLatido\(AGENTE_DESCUBRIR/)
})
