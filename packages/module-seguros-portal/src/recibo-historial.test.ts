import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  SITUACIONES_RECIBO,
  reciboAnulado,
  reciboAlCobro,
  etiquetaSituacionRecibo,
  tonoSituacionRecibo,
  fechaReciboFiable,
  ordenarRecibos,
  estadoRecibos,
  resumirRecibos,
  type ReciboHistorial,
} from './recibo-historial.ts'

const d = (iso: string) => new Date(iso)

const recibo = (p: Partial<ReciboHistorial> & { situacion: string }): ReciboHistorial => ({
  importe: 100,
  fechaEmision: null,
  fechaVencimiento: null,
  ...p,
})

test('el vocabulario es el de la BD: los cinco valores de recibo_estado', () => {
  assert.deepEqual([...SITUACIONES_RECIBO], ['emitido', 'pendiente', 'cobrado', 'devuelto', 'anulado'])
})

test('anulado se reconoce con espacios y mayúsculas, y nada más lo es', () => {
  assert.equal(reciboAnulado(' ANULADO '), true)
  for (const s of ['emitido', 'pendiente', 'cobrado', 'devuelto']) {
    assert.equal(reciboAnulado(s), false, s)
  }
})

test('al cobro son emitido y pendiente, no cobrado ni devuelto ni anulado', () => {
  assert.equal(reciboAlCobro('emitido'), true)
  assert.equal(reciboAlCobro('pendiente'), true)
  for (const s of ['cobrado', 'devuelto', 'anulado']) {
    assert.equal(reciboAlCobro(s), false, s)
  }
})

test('cada situación tiene su propia etiqueta y una desconocida sale tal cual', () => {
  const etiquetas = SITUACIONES_RECIBO.map(etiquetaSituacionRecibo)
  assert.equal(new Set(etiquetas).size, SITUACIONES_RECIBO.length, 'dos situaciones comparten etiqueta')
  // Lo que importa de verdad: un valor nuevo NO cae a una palabra tranquilizadora.
  assert.equal(etiquetaSituacionRecibo('en_reclamacion'), 'en_reclamacion')
})

test('devuelto tiene tono propio: no es «cobrado» ni «anulado»', () => {
  assert.equal(tonoSituacionRecibo('devuelto'), 'devuelto')
  assert.equal(tonoSituacionRecibo('cobrado'), 'cobrado')
  assert.equal(tonoSituacionRecibo('pendiente'), 'al-cobro')
  assert.equal(tonoSituacionRecibo('emitido'), 'al-cobro')
  assert.equal(tonoSituacionRecibo('anulado'), 'anulado')
})

test('la fecha centinela 0001-01-01 se lee como «no se sabe», no como una fecha', () => {
  assert.equal(fechaReciboFiable(d('0001-01-01T00:00:00Z')), null)
  // El corte es 1900 y nada más: un epoch de 1970 PASA, y está medido que no
  // hay ninguno. Si el test dijera lo contrario estaría documentando un deseo.
  assert.notEqual(fechaReciboFiable(d('1970-01-01T00:00:00Z')), null)
  assert.equal(fechaReciboFiable(d('1899-12-31T00:00:00Z')), null)
  assert.equal(fechaReciboFiable(null), null)
  assert.equal(fechaReciboFiable(new Date('no es una fecha')), null)
  const real = d('2026-06-19T00:00:00Z')
  assert.equal(fechaReciboFiable(real), real)
})

test('ordenar quita los anulados y deja lo reciente arriba', () => {
  const lista = [
    recibo({ situacion: 'cobrado', fechaEmision: d('2025-01-01T00:00:00Z') }),
    recibo({ situacion: 'anulado', fechaEmision: d('2026-06-01T00:00:00Z') }),
    recibo({ situacion: 'pendiente', fechaEmision: d('2026-01-01T00:00:00Z') }),
  ]
  const orden = ordenarRecibos(lista)
  assert.deepEqual(
    orden.map((r) => r.situacion),
    ['pendiente', 'cobrado'],
  )
})

test('un recibo SIN fecha va al final, nunca arriba (el NULLS FIRST de Postgres)', () => {
  const lista = [
    recibo({ situacion: 'pendiente', fechaEmision: null }),
    recibo({ situacion: 'cobrado', fechaEmision: d('2024-01-01T00:00:00Z') }),
    recibo({ situacion: 'cobrado', fechaEmision: d('2026-01-01T00:00:00Z') }),
  ]
  const orden = ordenarRecibos(lista)
  assert.equal(orden[0]?.fechaEmision?.getUTCFullYear(), 2026)
  assert.equal(orden[2]?.fechaEmision, null, 'el que no tiene fecha se coló arriba')
})

test('los tres estados del bloque son TRES, y «todos anulados» no es «sin informar»', () => {
  assert.equal(estadoRecibos([]), 'sin_informar')
  assert.equal(estadoRecibos([{ situacion: 'anulado' }, { situacion: 'anulado' }]), 'solo_anulados')
  assert.equal(estadoRecibos([{ situacion: 'anulado' }, { situacion: 'cobrado' }]), 'con_recibos')
})

test('el total del resumen NO cuenta los anulados, y los cuenta aparte', () => {
  const crudos = [
    recibo({ situacion: 'anulado', importe: -1268.18, fechaEmision: d('2026-04-25T00:00:00Z') }),
    recibo({ situacion: 'anulado', importe: 1268.18, fechaEmision: d('2026-04-25T00:00:00Z') }),
    recibo({ situacion: 'cobrado', importe: 382.37, fechaEmision: d('2026-06-19T00:00:00Z') }),
  ]
  const ordenados = ordenarRecibos(crudos)
  const r = resumirRecibos(ordenados, crudos.length - ordenados.length)
  assert.equal(r.total, 1)
  assert.equal(r.anulados, 2)
  assert.equal(r.ultimoCobrado?.importe, 382.37)
})

test('el próximo al cobro es el de vencimiento más próximo, y sin vencimiento no adelanta', () => {
  const crudos = [
    recibo({ situacion: 'pendiente', fechaVencimiento: d('2027-11-01T00:00:00Z'), fechaEmision: d('2026-08-23T00:00:00Z') }),
    recibo({ situacion: 'pendiente', fechaVencimiento: d('2026-10-01T00:00:00Z'), fechaEmision: d('2026-08-01T00:00:00Z') }),
    recibo({ situacion: 'pendiente', fechaVencimiento: null, fechaEmision: d('2026-08-30T00:00:00Z') }),
  ]
  const r = resumirRecibos(ordenarRecibos(crudos), 0)
  assert.equal(r.proximoAlCobro?.fechaVencimiento?.getUTCFullYear(), 2026)
})

test('un devuelto cuenta como devuelto y no se pierde entre los cobrados', () => {
  const crudos = [
    recibo({ situacion: 'devuelto', importe: 107.35, fechaEmision: d('2026-06-19T00:00:00Z') }),
    recibo({ situacion: 'cobrado', importe: 97.38, fechaEmision: d('2026-01-19T00:00:00Z') }),
  ]
  const r = resumirRecibos(ordenarRecibos(crudos), 0)
  assert.equal(r.devueltos, 1)
  assert.equal(r.total, 2)
})
