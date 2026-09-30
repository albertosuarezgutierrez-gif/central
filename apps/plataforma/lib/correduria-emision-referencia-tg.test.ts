// «Emite AS-26-0005 con efecto 2026-10-10» (30/09/2026). Puro: sin red ni BD.
// Lo que se vigila: solo se emite lo que iba EN EL DOCUMENTO; varias opciones → se pregunta; caducado,
// retirado o emitido → no se emite; un fallo de búsqueda nunca es «no existe»; y el precio se casa por
// su identidad o por compañía + categoría + modalidad EXACTAS, jamás por parecido.

import { test } from 'node:test'
import assert from 'node:assert/strict'

import { PATRON_REFERENCIA_TEXTO, precioDeOpcion, resolverReferenciaEmision } from './correduria-emision-referencia-tg.ts'
import type { BusquedaReferencia, OpcionReferencia, PresupuestoReferencia } from './referencia-presupuesto-asegura.ts'
import type { Precio } from './retarificar-asegura.ts'
import { clasificarDestino } from './correduria-asistente.ts'

const REALE: OpcionReferencia = { id: 'o1', compania: 'Reale', producto: 'Autos', modalidad: 'Reale Terceros Ampliado', categoria: 'Terceros ampliado', primaEur: 358.36, precioId: 'tp-1' }
const MAPFRE: OpcionReferencia = { id: 'o2', compania: 'Mapfre', producto: 'Autos', modalidad: 'Todo Riesgo con franquicia 300', categoria: 'Todo riesgo', primaEur: 612.1, precioId: 'tp-2' }

const P = (o: Partial<PresupuestoReferencia> = {}): PresupuestoReferencia => ({
  id: 'p1',
  referencia: 'AS-26-0005',
  clienteId: 'c1',
  cliente: 'Antonio Cruz',
  ramo: 'auto',
  polizaId: null,
  tarificacionId: 't1',
  oportunidadId: 'op1',
  estado: 'descargado',
  rotuloEstado: 'PDF descargado',
  emitible: true,
  venceEl: '2026-10-14T00:00:00.000Z',
  polizaEmitidaId: null,
  opciones: [REALE],
  ...o,
})
const ok = (p: PresupuestoReferencia): BusquedaReferencia => ({ estado: 'ok', presupuesto: p })
const SIN_PISTA = { compania: null, modalidad: null, primaEur: null }

test('el LLM y el reparto reconocen la referencia AS-AA-NNNN', () => {
  assert.ok(PATRON_REFERENCIA_TEXTO.test('emite AS-26-0005 con efecto 2026-10-10'))
  assert.ok(PATRON_REFERENCIA_TEXTO.test('emite as 26 0005'))
  assert.ok(!PATRON_REFERENCIA_TEXTO.test('pagué 2026-10-10 en la gasolinera'))
  assert.equal(clasificarDestino('emite AS-26-0005 con efecto 2026-10-10'), 'correduria')
})

test('una sola opción en documento: ésa es la modalidad, y viajan cliente, ramo y tarificación', () => {
  const r = resolverReferenciaEmision(ok(P()), SIN_PISTA)
  assert.equal(r.tipo, 'ok')
  if (r.tipo !== 'ok') return
  assert.equal(r.opcion.modalidad, 'Reale Terceros Ampliado')
  assert.equal(r.clienteId, 'c1')
  assert.equal(r.ramo, 'auto')
  assert.equal(r.tarificacionId, 't1')
})

test('varias opciones en documento: se pregunta, nunca se elige por posición', () => {
  const r = resolverReferenciaEmision(ok(P({ opciones: [REALE, MAPFRE] })), SIN_PISTA)
  assert.equal(r.tipo, 'elegir')
  if (r.tipo === 'elegir') assert.equal(r.opciones.length, 2)
  // Con la compañía dicha, queda una.
  const c = resolverReferenciaEmision(ok(P({ opciones: [REALE, MAPFRE] })), { compania: 'mapfre', modalidad: null, primaEur: null })
  assert.equal(c.tipo === 'ok' && c.opcion.compania, 'Mapfre')
  // Una compañía que el documento no lleva NO se cambia por otra.
  assert.equal(resolverReferenciaEmision(ok(P({ opciones: [REALE, MAPFRE] })), { compania: 'Allianz', modalidad: null, primaEur: null }).tipo, 'no')
})

test('caducado, retirado o emitido: no se emite y se dice', () => {
  for (const estado of ['caducado', 'retirado', 'emitido'] as const) {
    const r = resolverReferenciaEmision(ok(P({ estado, emitible: false })), SIN_PISTA)
    assert.equal(r.tipo, 'no', estado)
    if (r.tipo === 'no') assert.match(r.motivo, new RegExp(estado.toUpperCase()))
  }
  // `emitible:false` manda aunque el estado parezca vivo (fallo seguro).
  assert.equal(resolverReferenciaEmision(ok(P({ emitible: false })), SIN_PISTA).tipo, 'no')
})

test('un fallo de búsqueda es ERROR, nunca «no existe»', () => {
  const r = resolverReferenciaEmision({ estado: 'error', referencia: 'AS-26-0005', motivo: 'red' }, SIN_PISTA)
  assert.equal(r.tipo === 'no' && r.error, true)
  const n = resolverReferenciaEmision({ estado: 'no_encontrado', referencia: 'AS-26-0005' }, SIN_PISTA)
  assert.equal(n.tipo === 'no' && !n.error, true)
})

test('solo coche o moto nuevos: otro ramo o una sustitución de cartera no van por aquí', () => {
  assert.equal(resolverReferenciaEmision(ok(P({ ramo: 'hogar' })), SIN_PISTA).tipo, 'no')
  assert.equal(resolverReferenciaEmision(ok(P({ polizaId: 'pol-1' })), SIN_PISTA).tipo, 'no')
  assert.equal(resolverReferenciaEmision(ok(P({ opciones: [] })), SIN_PISTA).tipo, 'no')
})

const precio = (o: Partial<Precio>): Precio => ({ compania: 'Reale', categoria: 'Terceros ampliado', modalidad: 'Reale Terceros Ampliado', primaEur: 358.36, ...o })

test('el precio se casa por su identidad (precioId) aunque haya gemelos', () => {
  const r = precioDeOpcion([precio({ precioId: 'otro', id: 'Q1' }), precio({ precioId: 'tp-1', id: 'Q2' })], REALE)
  assert.equal(r.tipo === 'uno' && r.precio.id, 'Q2')
})

test('sin su fila, por compañía + categoría + modalidad EXACTAS; nunca por parecido', () => {
  const sinId = { ...REALE, precioId: null }
  const r = precioDeOpcion([precio({ id: 'Q1', modalidad: 'Reale Terceros' }), precio({ id: 'Q2' })], sinId)
  assert.equal(r.tipo === 'uno' && r.precio.id, 'Q2')
  // Ya no está: no se emite otra en su lugar.
  assert.equal(precioDeOpcion([precio({ modalidad: 'Reale Terceros' })], sinId).tipo, 'no')
  // Dos idénticos: no se puede saber cuál.
  assert.equal(precioDeOpcion([precio({ id: 'Q1' }), precio({ id: 'Q2' })], sinId).tipo, 'no')
})
